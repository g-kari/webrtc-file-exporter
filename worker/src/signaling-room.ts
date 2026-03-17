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

  private log(...args: unknown[]): void {
    console.log(`[DO ${new Date().toISOString()}] peers=${this.peers.size}`, ...args);
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
  async fetch(request: Request): Promise<Response> {
    const activePeers = this.ctx.getWebSockets();
    this.log(`fetch — 現在の接続数: ${activePeers.length}`);

    // ルーム満員チェック
    if (activePeers.length >= MAX_ROOM_PEERS) {
      this.log("ルーム満員 → accept して room-full 送信後 close");
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "room-full" }));
      server.close(4003, "ルームが満員です");
      return new Response(null, { status: 101, webSocket: client });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peerId: "" } satisfies PeerAttachment);
    this.log("WebSocket acceptWebSocket 完了");

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // WebSocket メッセージ受信ハンドラ
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    let data: SignalingMessage;
    try {
      data = JSON.parse(message) as SignalingMessage;
    } catch {
      console.warn("[DO] JSON パース失敗:", message);
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
          ws.send(JSON.stringify({ type: "joined", peerId: currentPeerId }));
          break;
        }

        const peerId = crypto.randomUUID();
        ws.serializeAttachment({ peerId } satisfies PeerAttachment);
        this.peers.set(peerId, ws);
        this.log(`join 完了 peerId=${peerId} / ルーム人数: ${this.peers.size}`);

        ws.send(JSON.stringify({ type: "joined", peerId }));

        for (const [existingPeerId, existingWs] of this.peers.entries()) {
          if (existingPeerId !== peerId) {
            // 先入室者にのみ peer-joined を通知 → 先入室者が Offer を生成する
            this.log(`peer-joined 通知 → 先入室者 ${existingPeerId} のみ`);
            existingWs.send(JSON.stringify({ type: "peer-joined", peerId }));
          }
        }
        break;
      }

      case "offer":
      case "answer":
      case "ice-candidate": {
        // SDP サイズ上限チェック（64KB）：巨大ペイロードによるメモリ枯渇を防ぐ
        if (data.sdp && JSON.stringify(data.sdp).length > 65536) {
          console.warn("[DO] SDP が大きすぎます — 中継を拒否");
          break;
        }
        // ICE candidate サイズ上限チェック（4KB）
        if (data.candidate && JSON.stringify(data.candidate).length > 4096) {
          console.warn("[DO] ICE candidate が大きすぎます — 中継を拒否");
          break;
        }
        let relayCount = 0;
        for (const [peerId, peerWs] of this.peers.entries()) {
          if (peerId !== currentPeerId) {
            peerWs.send(JSON.stringify({ ...data, fromPeerId: currentPeerId }));
            relayCount++;
          }
        }
        this.log(`中継 type=${data.type} from=${currentPeerId} → ${relayCount}件`);
        break;
      }

      case "leave": {
        if (currentPeerId) {
          this.peers.delete(currentPeerId);
          this.log(`leave peerId=${currentPeerId} / 残り: ${this.peers.size}`);
          for (const peerWs of this.peers.values()) {
            peerWs.send(JSON.stringify({ type: "leave", peerId: currentPeerId }));
          }
          ws.close(1000, "leave");
        }
        break;
      }
    }
  }

  // WebSocket 切断ハンドラ
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    const peerId = attachment?.peerId ?? "";
    this.log(`WS切断 peerId=${peerId || "(未join)"} code=${code} reason=${reason}`);

    if (peerId && this.peers.has(peerId)) {
      this.peers.delete(peerId);
      for (const peerWs of this.peers.values()) {
        peerWs.send(JSON.stringify({ type: "leave", peerId }));
      }
    }
  }

  // WebSocket エラーハンドラ
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    console.error(`[DO] WebSocket エラー peerId=${attachment?.peerId ?? "(未join)"}:`, error);
    // webSocketClose は Cloudflare Workers が自動的に呼び出すためここでは呼ばない
  }
}
