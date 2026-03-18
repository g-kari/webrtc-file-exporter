// Durable Object: WebSocket シグナリングルーム

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

// ルームの最大収容人数
const MAX_ROOM_PEERS = 2;

// シグナリングメッセージの型定義（クライアント → Worker 受信分）
type IncomingMessageType = "join" | "offer" | "answer" | "ice-candidate" | "leave";
interface SignalingMessage {
  type: IncomingMessageType;
  peerId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

// WebSocket に付与するピア情報
interface PeerAttachment {
  peerId: string;
}

export class SignalingRoom extends DurableObject {
  // 接続中のピアリスト（peerId → WebSocket）
  private peers: Map<string, WebSocket> = new Map();

  private get logPrefix(): string {
    return `[DO ${new Date().toISOString()}] peers=${this.peers.size}`;
  }

  private log(...args: unknown[]): void {
    console.log(this.logPrefix, ...args);
  }

  private warn(...args: unknown[]): void {
    console.warn(this.logPrefix, ...args);
  }

  private error(...args: unknown[]): void {
    console.error(this.logPrefix, ...args);
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hibernation から復元された WebSocket を再登録
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as PeerAttachment | null;
      if (attachment?.peerId) {
        this.peers.set(attachment.peerId, ws);
      }
    }
    this.log("DO 起動（Hibernation復元）");
  }

  // WebSocket 接続を受け付ける
  fetch(request: Request): Response {
    const wsCount = this.ctx.getWebSockets().length;
    this.log(`fetch — 現在の接続数: ${wsCount}`);

    if (wsCount >= MAX_ROOM_PEERS) {
      return this.rejectRoomFull();
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peerId: "" } satisfies PeerAttachment);
    this.log("WebSocket acceptWebSocket 完了");

    return new Response(null, { status: 101, webSocket: client });
  }

  // ルーム満員時に room-full を送信して接続を拒否する
  private rejectRoomFull(): Response {
    this.log("ルーム満員 → accept して room-full 送信後 close");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "room-full" }));
    server.close(4003, "ルームが満員です");
    return new Response(null, { status: 101, webSocket: client });
  }

  // WebSocket メッセージ受信ハンドラ
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;

    let data: SignalingMessage;
    try {
      data = JSON.parse(message) as SignalingMessage;
    } catch {
      this.warn("JSON パース失敗:", message);
      return;
    }

    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    const currentPeerId = attachment?.peerId ?? "";
    this.log(`受信 type=${data.type} from=${currentPeerId || "(未join)"}`);

    switch (data.type) {
      case "join": {
        // 既に join 済みの場合は冪等に応答して終了
        if (currentPeerId) {
          this.log(`join 重複受信 peerId=${currentPeerId} — 無視`);
          this.safeSend(ws, JSON.stringify({ type: "joined", peerId: currentPeerId }));
          break;
        }

        const peerId = crypto.randomUUID();
        ws.serializeAttachment({ peerId } satisfies PeerAttachment);
        this.peers.set(peerId, ws);
        this.log(`join 完了 peerId=${peerId} / ルーム人数: ${this.peers.size}`);

        this.safeSend(ws, JSON.stringify({ type: "joined", peerId }));

        for (const [existingPeerId, existingWs] of this.peers.entries()) {
          if (existingPeerId !== peerId) {
            // 先入室者にのみ peer-joined を通知 → 先入室者が Offer を生成する
            this.log(`peer-joined 通知 → 先入室者 ${existingPeerId} のみ`);
            this.safeSend(existingWs, JSON.stringify({ type: "peer-joined", peerId }));
          }
        }
        break;
      }

      case "offer":
      case "answer":
      case "ice-candidate": {
        // SDP サイズ上限チェック（64KB）：巨大ペイロードによるメモリ枯渇を防ぐ
        if (data.sdp && JSON.stringify(data.sdp).length > 65536) {
          this.warn("SDP が大きすぎます — 中継を拒否");
          break;
        }
        // ICE candidate サイズ上限チェック（4KB）
        if (data.candidate && JSON.stringify(data.candidate).length > 4096) {
          this.warn("ICE candidate が大きすぎます — 中継を拒否");
          break;
        }
        let relayCount = 0;
        for (const [peerId, peerWs] of this.peers.entries()) {
          if (peerId !== currentPeerId) {
            this.safeSend(peerWs, JSON.stringify({ ...data, fromPeerId: currentPeerId }));
            relayCount++;
          }
        }
        this.log(`中継 type=${data.type} from=${currentPeerId} → ${relayCount}件`);
        break;
      }

      case "leave": {
        if (currentPeerId) {
          this.removePeerAndNotify(ws);
          this.log(`leave peerId=${currentPeerId} / 残り: ${this.peers.size}`);
          ws.close(1000, "leave");
        }
        break;
      }
    }
  }

  // WebSocket 切断ハンドラ
  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const peerId = this.removePeerAndNotify(ws);
    this.log(`WS切断 peerId=${peerId || "(未join)"} code=${code} reason=${reason}`);
  }

  // WebSocket エラーハンドラ
  webSocketError(ws: WebSocket, error: unknown): void {
    // webSocketClose が自動呼び出しされない場合に備えてピアを解放する
    // peers.has() チェックにより webSocketClose との二重実行を防ぐ
    const peerId = this.removePeerAndNotify(ws);
    this.error(`WebSocket エラー peerId=${peerId || "(未join)"}:`, error);
  }

  /**
   * WebSocket.send() を安全に呼び出す。
   * 相手ソケットが閉じていた場合は warn のみで継続（例外で後続処理が中断しないよう）。
   */
  private safeSend(ws: WebSocket, message: string): void {
    try {
      ws.send(message);
    } catch (e) {
      this.warn('WebSocket.send() 失敗（相手切断？）:', e);
    }
  }

  /**
   * ピアを peers マップから削除し、残りのピアに leave を通知する。
   * peers.has() チェックにより webSocketClose / webSocketError の二重実行を防ぐ。
   * @returns 削除されたピアの peerId（未 join または二重呼び出しの場合は空文字）
   */
  private removePeerAndNotify(ws: WebSocket): string {
    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    const peerId = attachment?.peerId ?? "";
    if (peerId && this.peers.has(peerId)) {
      this.peers.delete(peerId);
      for (const peerWs of this.peers.values()) {
        this.safeSend(peerWs, JSON.stringify({ type: "leave", peerId }));
      }
    }
    return peerId;
  }
}
