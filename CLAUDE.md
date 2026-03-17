# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

WebRTC DataChannel を使ったブラウザ間 P2P ファイル転送アプリ。
シグナリングサーバーは Cloudflare Workers + Durable Objects、NAT越えは Cloudflare Calls (TURN) を利用。
カスタムドメイン: webrtc-file-exporter.0g0.xyz

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **バックエンド**: Cloudflare Workers + Durable Objects (Hibernation API 使用)
- **通信**: WebSocket (シグナリング) + WebRTC DataChannel (P2P)
- **TURN**: Cloudflare Calls (NAT越え)

## 開発コマンド

```bash
# Worker 開発
cd worker && npm run dev       # wrangler dev でローカル起動
cd worker && npm run type-check  # TypeScript 型チェック

# フロントエンド開発
cd frontend && npm run dev     # Vite 開発サーバー
cd frontend && npm run type-check  # TypeScript 型チェック
cd frontend && npm run build   # 本番ビルド（worker/deply 前に実施）

# デプロイ（順序重要）
cd frontend && npm run build
cd worker && wrangler deploy
```

## アーキテクチャ

### 全体フロー

```
ブラウザA ──WebSocket──> Cloudflare Worker ──> Durable Object (SignalingRoom)
                                                      │
ブラウザB ──WebSocket──> Cloudflare Worker ────────────┘
                                              (SDP/ICE候補の交換)

シグナリング完了後:
ブラウザA ──WebRTC DataChannel (P2P or TURN relay)──> ブラウザB
```

### Worker (worker/src/)

- **index.ts**: エントリポイント。`/api/turn-credentials` と `/api/room/:id/ws` のルーティング、静的アセット配信。同一オリジン CORS のみ許可。
- **signaling-room.ts**: `SignalingRoom` Durable Object。WebSocket Hibernation API を使いコスト削減。ルーム最大2名制限。`join` / `offer` / `answer` / `ice-candidate` / `leave` メッセージを中継。先入室者のみに `peer-joined` を送信して Offer 側を決定する。
- **turn.ts**: Cloudflare Calls API から TURN クレデンシャル（TTL 3600s）を取得。

### フロントエンド (frontend/src/)

**ルーティング**: URL ハッシュ (`#/<roomId>`) でルーム判定。ルームなし → `RoomCreate`、あり → `RoomView`。

**lib/ ライブラリ層**:
- `signaling.ts` — `SignalingClient`: WebSocket でシグナリングサーバーと通信。`room-full` イベントも処理。
- `webrtc.ts` — `PeerConnection`: `RTCPeerConnection` のラッパー。DataChannel の ordered モード（順序保証）で作成。
- `file-sender.ts` — `FileSender`: 64KB チャンクに分割送信。`bufferedAmount > 256KB` でバックプレッシャー待機。`file-start` (JSON) → チャンク (ArrayBuffer) → `file-end` (JSON) のプロトコル。
- `file-receiver.ts` — `FileReceiver`: チャンクを蓄積し `file-end` 受信時に `Blob` → `URL.createObjectURL()` で DL リンク生成。

**components/ コンポーネント層**:
- `RoomView.tsx`: メイン画面。シグナリング・WebRTC・ファイル転送のオーケストレーション。Blob URL をリーク防止のため `blobUrlsRef` で管理しダウンロード後に `revokeObjectURL`。
- `RoomCreate.tsx`: ルーム作成画面（UUID 生成 → ハッシュ遷移）。
- `ConnectionStatus.tsx`: WS / RTC の接続状態表示。
- `FileDrop.tsx`: ドラッグ&ドロップエリア。
- `FileList.tsx`: 転送ファイル一覧と進捗表示。

**types/index.ts**: `ConnectionState`（`'disconnected' | 'connecting' | 'connected' | 'failed' | 'room-full'`）と `TransferFile` を定義。

### Worker 環境変数（secrets）

```bash
cd worker
wrangler secret put TURN_KEY_ID      # Cloudflare Calls TURN Key ID
wrangler secret put TURN_KEY_API_TOKEN  # Cloudflare Calls API Token
```

## コード規約

- コメント・コミットメッセージは日本語
- TypeScript strict mode
- チャンクサイズ: 64KB
- バッファ閾値: 256KB
