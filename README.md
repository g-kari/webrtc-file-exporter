# WebRTC File Exporter

WebRTC DataChannel を使ったブラウザ間 P2P ファイル転送アプリ。

## 特徴

- **P2P 直接転送**: サーバーを経由せずブラウザ間で直接ファイル転送
- **大容量対応**: バックプレッシャー制御による安定した大ファイル転送
- **NAT越え**: Cloudflare TURN サーバーによる確実な接続確立
- **シンプルな UI**: URL 共有だけで接続開始

## セットアップ

### 必要環境

- Node.js v18 以上
- Cloudflare アカウント
- Wrangler CLI (`npm install -g wrangler`)

### インストール

```bash
# Worker 依存関係
cd worker && npm install

# フロントエンド依存関係
cd frontend && npm install
```

### 設定

1. Cloudflare Calls で TURN Key を作成
2. Worker にシークレットを設定:
   ```bash
   cd worker
   wrangler secret put TURN_KEY_ID
   wrangler secret put TURN_KEY_API_TOKEN
   ```

### 開発

```bash
# Worker をローカル起動
cd worker && npm run dev

# フロントエンド開発サーバー（別ターミナル）
cd frontend && npm run dev
```

### デプロイ

```bash
cd frontend && npm run build
cd worker && wrangler deploy
```

## 使い方

1. https://webrtc-file-exporter.0g0.xyz にアクセス
2. 「ルームを作成」ボタンをクリック
3. 表示された URL を相手に共有
4. 相手が URL にアクセスすると接続が確立
5. ファイルをドラッグ＆ドロップで転送開始

## アーキテクチャ

```
ブラウザA ──WebSocket──> Cloudflare Worker ──> Durable Object (シグナリング)
                                                      │
ブラウザB ──WebSocket──> Cloudflare Worker ────────────┘
                                              (SDP/ICE候補の交換)

シグナリング完了後:
ブラウザA ──WebRTC DataChannel (P2P or TURN relay)──> ブラウザB
```

## 技術的仕組み

### 1. シグナリング〜接続確立フロー

```mermaid
sequenceDiagram
    participant A as ブラウザA（先入室）
    participant DO as Durable Object<br/>（シグナリング）
    participant B as ブラウザB（後入室）

    Note over A,DO: ルーム作成・入室
    A->>DO: WS接続 + join
    DO-->>A: joined {peerId}

    Note over B,DO: 相手が共有URLを開く
    B->>DO: WS接続 + join
    DO-->>B: joined {peerId}
    DO-->>A: peer-joined（Bが入室）

    Note over A,B: WebRTC ネゴシエーション
    A->>A: createOffer()
    A->>DO: offer {sdp}
    DO-->>B: offer {sdp}

    B->>B: handleOffer() → createAnswer()
    B->>DO: answer {sdp}
    DO-->>A: answer {sdp}

    A->>A: handleAnswer()

    par ICE候補の交換（並行）
        A->>DO: ice-candidate
        DO-->>B: ice-candidate
    and
        B->>DO: ice-candidate
        DO-->>A: ice-candidate
    end

    Note over A,B: P2P DataChannel 確立
    A-->>B: DataChannel open（STUN/TURN経由）
```

### 2. ファイル転送プロトコル

```mermaid
sequenceDiagram
    participant S as 送信側
    participant DC as WebRTC DataChannel
    participant R as 受信側

    Note over S,R: DataChannel は ordered: true（順序保証）

    S->>DC: JSON {"type":"file-start", "fileId":"...", "name":"photo.jpg", "size":5242880}
    DC-->>R: file-start メタデータ受信 → ファイルリストに追加

    loop 64KB チャンクずつ
        S->>S: bufferedAmount > 256KB なら待機（バックプレッシャー）
        S->>DC: ArrayBuffer（最大64KB）
        DC-->>R: chunk 受信 → chunks[] に蓄積・進捗更新
    end

    S->>DC: JSON {"type":"file-end", "fileId":"..."}
    DC-->>R: file-end 受信 → Blob生成 → URL.createObjectURL()
    R->>R: ダウンロードリンク表示
```

### 3. NAT越え（TURN）フロー

```mermaid
sequenceDiagram
    participant A as ブラウザA
    participant W as Cloudflare Worker
    participant CF as Cloudflare Calls<br/>（TURN サーバー）
    participant B as ブラウザB

    Note over A,W: アプリ起動時
    A->>W: GET /api/turn-credentials
    W->>CF: POST /v1/turn/keys/{id}/credentials/generate-ice-servers<br/>TTL=3600秒
    CF-->>W: iceServers [{urls, username, credential}]
    W-->>A: iceServers（STUN + TURN エンドポイント）

    Note over A,B: ICE接続試行（優先順）
    A->>B: ① ホスト候補（直接接続）
    A->>B: ② サーバーリフレクティブ候補（STUN）
    A->>CF: ③ リレー候補（TURN）割り当て要求
    CF-->>A: relayAddress
    A->>CF: データ送信（リレー）
    CF->>B: データ転送
```

## ライセンス

MIT
