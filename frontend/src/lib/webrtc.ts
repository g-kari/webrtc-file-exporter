// RTCPeerConnection 管理

import { createLogger } from './logger';

const { log, warn } = createLogger('WebRTC');

export type DataChannelMessageHandler = (data: string | ArrayBuffer) => void;

export class PeerConnection {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private messageCallback: DataChannelMessageHandler | null = null;
  private openCallback: (() => void) | null = null;
  private closeCallback: (() => void) | null = null;
  /** remoteDescription が設定されるまで ICE candidate をバッファリングする */
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  /** closeHandlers の多重発火を防ぐフラグ（DataChannel/ICE/Connection の3経路から発火しうる） */
  private closeFired = false;

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
      // disconnected は一時的な状態（再接続可能）のため closeHandlers を発火しない
      // failed / closed の場合のみセッション終了とみなす
      if (s === 'failed' || s === 'closed') {
        warn('ICE 接続失敗:', s);
        this.fireClose();
      }
    };

    // PeerConnection 全体の接続状態
    this.pc.onconnectionstatechange = () => {
      log('Connection state:', this.pc.connectionState);
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.fireClose();
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
      // 使用中の ICE candidate ペアを表示（開発時のみ）
      if (import.meta.env.DEV) {
        void this.pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && (report as RTCIceCandidatePairStats).state === 'succeeded') {
              log('使用中の candidate-pair:', JSON.stringify(report));
            }
          });
        });
      }
      this.openCallback?.();
    };
    channel.onclose = () => {
      log('DataChannel close');
      this.fireClose();
    };
    channel.onerror = (e) => {
      warn('DataChannel error:', e);
    };
    channel.onmessage = (event) => {
      this.messageCallback?.(event.data as string | ArrayBuffer);
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

  /** remoteDescription を設定し、バッファリングされた ICE candidate を適用する */
  private async applyRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;
    await this.flushPendingIceCandidates();
  }

  /** 受け取った Offer を処理して Answer を生成する */
  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    log('handleOffer — remoteDescription set');
    await this.applyRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    log('Answer 生成完了 / localDescription set');
    return answer;
  }

  /** 受け取った Answer を処理する */
  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    log('handleAnswer — remoteDescription set');
    await this.applyRemoteDescription(sdp);
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
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        // ICE candidate 追加失敗は接続を破棄するほどではない（警告のみ）
        warn('ICE candidate フラッシュ失敗（継続）:', e);
      }
    }
  }

  /** DataChannel でデータを送信する。DataChannel が open でない場合は例外を投げる */
  send(data: string | ArrayBuffer): void {
    if (this.dataChannel?.readyState !== 'open') {
      throw new Error('DataChannel が open でないため送信できません');
    }
    // RTCDataChannel.send() は string/ArrayBuffer 両方を受け付けるが
    // TypeScript overload 解決のため ArrayBuffer にキャストして呼び出す
    this.dataChannel.send(data as ArrayBuffer);
  }

  /** DataChannel のバッファ量を取得する */
  get bufferedAmount(): number {
    return this.dataChannel?.bufferedAmount ?? 0;
  }

  /** DataChannel の bufferedamountlow イベントに Promise で待機する */
  waitForBufferDrain(threshold: number): Promise<void> {
    const dc = this.dataChannel;
    if (!dc || dc.bufferedAmount <= threshold) return Promise.resolve();

    return new Promise((resolve, reject) => {
      dc.bufferedAmountLowThreshold = threshold;

      const cleanup = () => {
        dc.removeEventListener('bufferedamountlow', onLow);
        dc.removeEventListener('close', onClose);
        dc.removeEventListener('error', onError);
      };

      const onLow = () => { cleanup(); resolve(); };
      // DataChannel が転送中に閉じた場合はエラーとして扱う（正常完了ではない）
      const onClose = () => { cleanup(); reject(new Error('DataChannel が転送中に閉じました')); };
      const onError = (e: Event) => { cleanup(); reject(e); };

      dc.addEventListener('bufferedamountlow', onLow);
      dc.addEventListener('close', onClose);
      dc.addEventListener('error', onError);
    });
  }

  /** メッセージ受信ハンドラを登録する */
  onMessage(handler: DataChannelMessageHandler): void {
    this.messageCallback = handler;
  }

  /** DataChannel オープンハンドラを登録する */
  onOpen(handler: () => void): void {
    this.openCallback = handler;
    // すでに開いている場合は即時呼び出す
    if (this.dataChannel?.readyState === 'open') {
      handler();
    }
  }

  /** DataChannel クローズハンドラを登録する */
  onClose(handler: () => void): void {
    this.closeCallback = handler;
  }

  /** closeHandlers を一度だけ発火する（多重呼び出し防止） */
  private fireClose(): void {
    if (this.closeFired) return;
    this.closeFired = true;
    this.closeCallback?.();
  }

  /** 接続を閉じる */
  close(): void {
    this.dataChannel?.close();
    this.pc.close();
  }
}
