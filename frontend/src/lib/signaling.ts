// WebSocket シグナリングクライアント

import type { SignalingMessage } from '../types';

type MessageHandler = (message: SignalingMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private closeHandlers: (() => void)[] = [];

  constructor(private readonly roomId: string) {}

  /** WebSocket 接続を確立する */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${location.host}/api/room/${this.roomId}/ws`;
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`WebSocket 接続エラー: ${String(e)}`));
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as SignalingMessage;
          this.messageHandlers.forEach((h) => h(message));
        } catch {
          // JSON パース失敗は無視
        }
      };
      this.ws.onclose = () => {
        this.closeHandlers.forEach((h) => h());
      };
    });
  }

  /** シグナリングメッセージを送信する */
  send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** メッセージ受信ハンドラを登録する */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /** 切断ハンドラを登録する */
  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  /** 接続を切断する */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
