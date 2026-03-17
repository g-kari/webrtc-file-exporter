// Cloudflare Worker エントリポイント

import { generateTurnCredentials } from "./turn";
import { SignalingRoom } from "./signaling-room";

// Worker の環境変数型定義
export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  TURN_KEY_ID: string;
  TURN_KEY_API_TOKEN: string;
  ASSETS: Fetcher;
}

// Durable Object のエクスポート
export { SignalingRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS ヘッダー設定（開発時用）
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API ルーティング
    if (url.pathname === "/api/turn-credentials" && request.method === "GET") {
      try {
        const credentials = await generateTurnCredentials(
          env.TURN_KEY_ID,
          env.TURN_KEY_API_TOKEN
        );
        return new Response(JSON.stringify(credentials), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("TURN クレデンシャル取得エラー:", error);
        return new Response(
          JSON.stringify({ error: "TURN クレデンシャルの取得に失敗しました" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // WebSocket シグナリング接続
    const wsMatch = url.pathname.match(/^\/api\/room\/([^/]+)\/ws$/);
    if (wsMatch) {
      const roomId = wsMatch[1];
      const upgradeHeader = request.headers.get("Upgrade");

      if (upgradeHeader !== "websocket") {
        return new Response("WebSocket 接続が必要です", { status: 426 });
      }

      // Durable Object にルーティング
      const roomObjectId = env.SIGNALING_ROOM.idFromName(roomId);
      const roomObject = env.SIGNALING_ROOM.get(roomObjectId);
      return roomObject.fetch(request);
    }

    // 静的アセット配信
    return env.ASSETS.fetch(request);
  },
};
