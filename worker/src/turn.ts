// TURN クレデンシャル生成モジュール

export interface TurnCredentials {
  iceServers: RTCIceServer[];
}

// Cloudflare Calls から TURN クレデンシャルを取得する
export async function generateTurnCredentials(
  turnKeyId: string,
  turnKeyApiToken: string
): Promise<TurnCredentials> {
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${turnKeyId}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${turnKeyApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 3600 }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TURN クレデンシャル取得失敗: ${response.status} ${text}`);
  }

  const data = await response.json<TurnCredentials>();
  return data;
}
