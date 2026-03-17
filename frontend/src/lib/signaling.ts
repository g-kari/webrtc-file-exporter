// WebSocket シグナリングクライアント

import type { SignalingMessage } from '../types';

const log = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(`[Signaling ${new Date().toISOString()}]`, ...args);
};
const warn = (...args: unknown[]) =>
  console.warn(`[Signaling ${new Date().toISOString()}]`, ...args);

type MessageHandler = (message: SignalingMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private closeHandlers: (() => void)[] = [];
  private roomFullHandlers: (() => void)[] = [];

  constructor(private readonly roomId: string) {}

  /** WebSocket 接続を確立する */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${location.host}/api/room/${this.roomId}/ws`;
      log('WS 接続開始:', url);
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      // onerror → onclose の二重発火を防ぐためのフラグ
      let settled = false;

      this.ws.onopen = () => {
        log('WS 接続確立 ✅');
        settled = true;
        resolve();
      };
      this.ws.onerror = (e) => {
        warn('WS エラー:', e);
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket 接続エラー: ${String(e)}`));
        }
      };
      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') return;
          const raw = JSON.parse(event.data) as { type: string };
          log('受信 ←', raw.type, JSON.stringify(raw));
          if (raw.type === 'room-full') {
            this.roomFullHandlers.forEach((h) => h());
            return;
          }
          const message = raw as unknown as SignalingMessage;
          this.messageHandlers.forEach((h) => {
            Promise.resolve(h(message)).catch((e: unknown) => {
              warn('onMessage ハンドラエラー:', e);
            });
          });
        } catch {
          warn('JSON パース失敗:', event.data);
        }
      };
      this.ws.onclose = (e) => {
        log('WS 切断 code:', e.code, 'reason:', e.reason);
        // 接続確立後の切断のみ closeHandlers を発火
        if (settled) {
          this.closeHandlers.forEach((h) => h());
        }
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

  /** ルーム満員ハンドラを登録する */
  onRoomFull(handler: () => void): void {
    this.roomFullHandlers.push(handler);
  }

  /** 接続を切断する */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
