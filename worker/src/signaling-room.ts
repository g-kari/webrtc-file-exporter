// Durable Object: WebSocket シグナリングルーム

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

// シグナリングメッセージの型定義
interface SignalingMessage {
  type: "join" | "peer-joined" | "offer" | "answer" | "ice-candidate" | "leave";
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

    // ルーム最大2名制限
    if (activePeers.length >= 2) {
      this.log("ルーム満員 → 503");
      return new Response("ルームが満員です", { status: 503 });
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
        const peerId = crypto.randomUUID();
        ws.serializeAttachment({ peerId } satisfies PeerAttachment);
        this.peers.set(peerId, ws);
        this.log(`join 完了 peerId=${peerId} / ルーム人数: ${this.peers.size}`);

        ws.send(JSON.stringify({ type: "joined", peerId }));

        for (const [existingPeerId, existingWs] of this.peers.entries()) {
          if (existingPeerId !== peerId) {
            this.log(`peer-joined 通知 → ${existingPeerId}（既存）と ${peerId}（新規）に相互通知`);
            existingWs.send(JSON.stringify({ type: "peer-joined", peerId }));
            ws.send(JSON.stringify({ type: "peer-joined", peerId: existingPeerId }));
          }
        }
        break;
      }

      case "offer":
      case "answer":
      case "ice-candidate": {
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

    if (peerId) {
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
    await this.webSocketClose(ws, 1011, "error");
  }
}
