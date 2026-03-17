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
    const reqId = crypto.randomUUID().slice(0, 8);

    console.log(`[Worker ${reqId}] ${request.method} ${url.pathname} cf=${JSON.stringify(request.cf?.colo)}`);

    // CORS ヘッダー設定（同一オリジンのみ許可）
    const ownOrigin = `${url.protocol}//${url.host}`;
    const requestOrigin = request.headers.get("Origin");
    const corsOrigin = (!requestOrigin || requestOrigin === ownOrigin) ? ownOrigin : null;

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (corsOrigin) {
      corsHeaders["Access-Control-Allow-Origin"] = corsOrigin;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 異なるオリジンからの API アクセスを拒否
    if (requestOrigin && requestOrigin !== ownOrigin) {
      return new Response("Forbidden", { status: 403 });
    }

    // API ルーティング
    if (url.pathname === "/api/turn-credentials" && request.method === "GET") {
      console.log(`[Worker ${reqId}] TURN クレデンシャル生成開始`);
      try {
        const credentials = await generateTurnCredentials(
          env.TURN_KEY_ID,
          env.TURN_KEY_API_TOKEN
        );
        console.log(`[Worker ${reqId}] TURN クレデンシャル生成完了`);
        return new Response(JSON.stringify(credentials), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        console.error(`[Worker ${reqId}] TURN クレデンシャル取得エラー:`, error);
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
        console.warn(`[Worker ${reqId}] WS Upgrade ヘッダーなし`);
        return new Response("WebSocket 接続が必要です", { status: 426 });
      }

      console.log(`[Worker ${reqId}] WS接続 → DO roomId=${roomId}`);
      const roomObjectId = env.SIGNALING_ROOM.idFromName(roomId);
      const roomObject = env.SIGNALING_ROOM.get(roomObjectId);
      return roomObject.fetch(request);
    }

    // 静的アセット配信
    return env.ASSETS.fetch(request);
  },
};
