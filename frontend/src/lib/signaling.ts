// WebSocket シグナリングクライアント

import type { SignalingMessage } from '../types';

const log = (...args: unknown[]) =>
  console.log(`[Signaling ${new Date().toISOString()}]`, ...args);
const warn = (...args: unknown[]) =>
  console.warn(`[Signaling ${new Date().toISOString()}]`, ...args);

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
      log('WS 接続開始:', url);
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        log('WS 接続確立 ✅');
        resolve();
      };
      this.ws.onerror = (e) => {
        warn('WS エラー:', e);
        reject(new Error(`WebSocket 接続エラー: ${String(e)}`));
      };
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as SignalingMessage;
          log('受信 ←', message.type, JSON.stringify(message));
          this.messageHandlers.forEach((h) => h(message));
        } catch {
          warn('JSON パース失敗:', event.data);
        }
      };
      this.ws.onclose = (e) => {
        log('WS 切断 code:', e.code, 'reason:', e.reason);
        this.closeHandlers.forEach((h) => h());
      };
    });
  }

  /** シグナリングメッセージを送信する */
  send(message: object): void {
    const msg = message as { type?: string };
    if (this.ws?.readyState === WebSocket.OPEN) {
      log('送信 →', msg.type, JSON.stringify(message));
      this.ws.send(JSON.stringify(message));
    } else {
      warn('送信失敗（WS未接続）:', msg.type);
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
