// RTCPeerConnection 管理

const log = (...args: unknown[]) =>
  console.log(`[WebRTC ${new Date().toISOString()}]`, ...args);
const warn = (...args: unknown[]) =>
  console.warn(`[WebRTC ${new Date().toISOString()}]`, ...args);

export type DataChannelMessageHandler = (data: string | ArrayBuffer) => void;

export class PeerConnection {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private messageHandlers: DataChannelMessageHandler[] = [];
  private openHandlers: (() => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  /** remoteDescription が設定されるまで ICE candidate をバッファリングする */
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  constructor(
    iceServers: RTCIceServer[],
    private readonly onIceCandidate: (candidate: RTCIceCandidateInit) => void
  ) {
    log('PeerConnection 生成', { iceServers });
    this.pc = new RTCPeerConnection({ iceServers });

    // ICE 候補収集の状態変化
    this.pc.onicegatheringstatechange = () => {
      log('ICE gathering state:', this.pc.iceGatheringState);
    };

    // ICE 接続状態の変化
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      log('ICE connection state:', s);
      if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        warn('ICE 接続失敗/切断:', s);
        this.closeHandlers.forEach((h) => h());
      }
    };

    // PeerConnection 全体の接続状態
    this.pc.onconnectionstatechange = () => {
      log('Connection state:', this.pc.connectionState);
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.closeHandlers.forEach((h) => h());
      }
    };

    // シグナリング状態
    this.pc.onsignalingstatechange = () => {
      log('Signaling state:', this.pc.signalingState);
    };

    // ICE 候補をシグナリング経由で送信
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const c = event.candidate;
        log('ICE candidate 送信:', c.type, c.protocol, c.address, c.port, '→', c.candidate);
        this.onIceCandidate(c.toJSON());
      } else {
        log('ICE candidate 収集完了（null candidate）');
      }
    };

    // 相手からの DataChannel を受信
    this.pc.ondatachannel = (event) => {
      log('DataChannel 受信:', event.channel.label);
      this.setupDataChannel(event.channel);
    };
  }

  /** DataChannel をセットアップする */
  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    channel.binaryType = 'arraybuffer';
    log('DataChannel セットアップ:', channel.label, '/ readyState:', channel.readyState);

    channel.onopen = () => {
      log('DataChannel open ✅');
      // 使用中の ICE candidate ペアを表示
      void this.pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report as RTCIceCandidatePairStats).state === 'succeeded') {
            log('使用中の candidate-pair:', JSON.stringify(report));
          }
        });
      });
      this.openHandlers.forEach((h) => h());
    };
    channel.onclose = () => {
      log('DataChannel close');
      this.closeHandlers.forEach((h) => h());
    };
    channel.onerror = (e) => {
      warn('DataChannel error:', e);
    };
    channel.onmessage = (event) => {
      this.messageHandlers.forEach((h) => h(event.data as string | ArrayBuffer));
    };
  }

  /** Offer を生成して DataChannel を作成する（先入室者が呼ぶ） */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    log('createOffer 開始');
    const channel = this.pc.createDataChannel('files', { ordered: true });
    this.setupDataChannel(channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    log('Offer 生成完了 / localDescription set');
    return offer;
  }

  /** 受け取った Offer を処理して Answer を生成する */
  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    log('handleOffer — remoteDescription set');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    log('Answer 生成完了 / localDescription set');
    return answer;
  }

  /** 受け取った Answer を処理する */
  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    log('handleAnswer — remoteDescription set');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
  }

  /** ICE 候補を追加する（remoteDescription 未設定時はバッファリング） */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet) {
      log('ICE candidate バッファリング（remoteDescription 未設定）:', candidate.candidate);
      this.pendingIceCandidates.push(candidate);
      return;
    }
    log('ICE candidate 追加:', candidate.candidate);
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** バッファリングされた ICE candidate を一括追加する */
  private async flushPendingIceCandidates(): Promise<void> {
    const candidates = this.pendingIceCandidates.splice(0);
    for (const candidate of candidates) {
      log('ICE candidate フラッシュ:', candidate.candidate);
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
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

    return new Promise((resolve, reject) => {
      if (!this.dataChannel) return resolve();
      this.dataChannel.bufferedAmountLowThreshold = threshold;

      const onLow = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); resolve(); };
      const onError = (e: Event) => { cleanup(); reject(e); };

      const cleanup = () => {
        this.dataChannel?.removeEventListener('bufferedamountlow', onLow);
        this.dataChannel?.removeEventListener('close', onClose);
        this.dataChannel?.removeEventListener('error', onError);
      };

      this.dataChannel.addEventListener('bufferedamountlow', onLow, { once: true });
      this.dataChannel.addEventListener('close', onClose, { once: true });
      this.dataChannel.addEventListener('error', onError, { once: true });
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
