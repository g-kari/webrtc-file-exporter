// WebSocket シグナリングクライアント

import type { SignalingMessage, OutgoingSignalingMessage } from '../types';
import { createLogger } from './logger';

const { log, warn } = createLogger('Signaling');

type MessageHandler = (message: SignalingMessage) => void | Promise<void>;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageCallback: MessageHandler | null = null;
  private closeCallback: (() => void) | null = null;
  private roomFullCallback: (() => void) | null = null;
  /** disconnect() による意図的切断フラグ（onclose での closeCallback 発火を抑制） */
  private disconnecting = false;

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
            this.roomFullCallback?.();
            return;
          }
          const message = raw as unknown as SignalingMessage;
          if (this.messageCallback) {
            Promise.resolve(this.messageCallback(message)).catch((e: unknown) => {
              warn('onMessage ハンドラエラー:', e);
            });
          }
        } catch {
          warn('JSON パース失敗:', event.data);
        }
      };
      this.ws.onclose = (e) => {
        log('WS 切断 code:', e.code, 'reason:', e.reason);
        // 接続確立後かつ意図的切断でない場合のみ closeCallback を発火
        if (settled && !this.disconnecting) {
          this.closeCallback?.();
        }
      };
    });
  }

  /** シグナリングメッセージを送信する */
  send(message: OutgoingSignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      log('送信 →', message.type, JSON.stringify(message));
      this.ws.send(JSON.stringify(message));
    } else {
      warn('送信失敗（WS未接続）:', message.type);
    }
  }

  /** メッセージ受信ハンドラを登録する */
  onMessage(handler: MessageHandler): void {
    this.messageCallback = handler;
  }

  /** 切断ハンドラを登録する */
  onClose(handler: () => void): void {
    this.closeCallback = handler;
  }

  /** ルーム満員ハンドラを登録する */
  onRoomFull(handler: () => void): void {
    this.roomFullCallback = handler;
  }

  /** 接続を切断する */
  disconnect(): void {
    this.disconnecting = true;
    this.ws?.close();
    this.ws = null;
  }
}
