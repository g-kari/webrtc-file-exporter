// RTCPeerConnection 管理

export type DataChannelMessageHandler = (data: string | ArrayBuffer) => void;

export class PeerConnection {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private messageHandlers: DataChannelMessageHandler[] = [];
  private openHandlers: (() => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  constructor(
    iceServers: RTCIceServer[],
    private readonly onIceCandidate: (candidate: RTCIceCandidateInit) => void
  ) {
    this.pc = new RTCPeerConnection({ iceServers });

    // ICE 候補をシグナリング経由で送信
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(event.candidate.toJSON());
      }
    };

    // 相手からの DataChannel を受信
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  /** DataChannel をセットアップする */
  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this.openHandlers.forEach((h) => h());
    };
    channel.onclose = () => {
      this.closeHandlers.forEach((h) => h());
    };
    channel.onmessage = (event) => {
      this.messageHandlers.forEach((h) => h(event.data as string | ArrayBuffer));
    };
  }

  /** Offer を生成して DataChannel を作成する（先入室者が呼ぶ） */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    // DataChannel を作成
    const channel = this.pc.createDataChannel('files', { ordered: true });
    this.setupDataChannel(channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** 受け取った Offer を処理して Answer を生成する */
  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /** 受け取った Answer を処理する */
  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  /** ICE 候補を追加する */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** DataChannel でデータを送信する */
  send(data: string | ArrayBuffer): void {
    if (!this.dataChannel) return;
    if (typeof data === 'string') {
      this.dataChannel.send(data);
    } else {
      this.dataChannel.send(data);
    }
  }

  /** DataChannel のバッファ量を取得する */
  get bufferedAmount(): number {
    return this.dataChannel?.bufferedAmount ?? 0;
  }

  /** DataChannel の bufferedamountlow イベントに Promise で待機する */
  waitForBufferDrain(threshold: number): Promise<void> {
    if (!this.dataChannel) return Promise.resolve();
    if (this.dataChannel.bufferedAmount <= threshold) return Promise.resolve();

    return new Promise((resolve) => {
      if (!this.dataChannel) return resolve();
      this.dataChannel.bufferedAmountLowThreshold = threshold;
      this.dataChannel.addEventListener('bufferedamountlow', () => {
        resolve();
      }, { once: true });
    });
  }

  /** メッセージ受信ハンドラを登録する */
  onMessage(handler: DataChannelMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /** DataChannel オープンハンドラを登録する */
  onOpen(handler: () => void): void {
    this.openHandlers.push(handler);
    // すでに開いている場合は即時呼び出す
    if (this.dataChannel?.readyState === 'open') {
      handler();
    }
  }

  /** DataChannel クローズハンドラを登録する */
  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  /** 接続を閉じる */
  close(): void {
    this.dataChannel?.close();
    this.pc.close();
  }
}
