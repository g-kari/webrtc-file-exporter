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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hibernation から復元された WebSocket を再登録
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as PeerAttachment | null;
      if (attachment?.peerId) {
        this.peers.set(attachment.peerId, ws);
      }
    }
  }

  // WebSocket 接続を受け付ける
  async fetch(request: Request): Promise<Response> {
    // ルーム最大2名制限
    const activePeers = this.ctx.getWebSockets();
    if (activePeers.length >= 2) {
      return new Response("ルームが満員です", { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // WebSocket Hibernation API で接続を受け付ける
    this.ctx.acceptWebSocket(server);

    // 接続維持のための自動 pong 設定
    server.serializeAttachment({ peerId: "" } satisfies PeerAttachment);

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
      return;
    }

    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    const currentPeerId = attachment?.peerId ?? "";

    switch (data.type) {
      case "join": {
        // 新規ピアの参加処理
        const peerId = crypto.randomUUID();
        ws.serializeAttachment({ peerId } satisfies PeerAttachment);
        this.peers.set(peerId, ws);

        // 参加確認を送信
        ws.send(JSON.stringify({ type: "joined", peerId }));

        // 既存ピアに新規参加を通知
        for (const [existingPeerId, existingWs] of this.peers.entries()) {
          if (existingPeerId !== peerId) {
            existingWs.send(JSON.stringify({ type: "peer-joined", peerId }));
            // 先入室者が Offer を生成するよう通知
            ws.send(JSON.stringify({ type: "peer-joined", peerId: existingPeerId }));
          }
        }
        break;
      }

      case "offer":
      case "answer":
      case "ice-candidate": {
        // 他のピアにメッセージを中継
        for (const [peerId, peerWs] of this.peers.entries()) {
          if (peerId !== currentPeerId) {
            peerWs.send(JSON.stringify({ ...data, fromPeerId: currentPeerId }));
          }
        }
        break;
      }

      case "leave": {
        // ピアの退出処理
        if (currentPeerId) {
          this.peers.delete(currentPeerId);
          // 残りのピアに退出を通知
          for (const peerWs of this.peers.values()) {
            peerWs.send(JSON.stringify({ type: "leave", peerId: currentPeerId }));
          }
        }
        break;
      }
    }
  }

  // WebSocket 切断ハンドラ
  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    const peerId = attachment?.peerId ?? "";

    if (peerId) {
      this.peers.delete(peerId);
      // 残りのピアに切断を通知
      for (const peerWs of this.peers.values()) {
        peerWs.send(JSON.stringify({ type: "leave", peerId }));
      }
    }
  }

  // WebSocket エラーハンドラ
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket エラー:", error);
    await this.webSocketClose(ws);
  }
}
