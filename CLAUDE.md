# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際に Claude Code への指針を提供します。

## プロジェクト概要

WebRTC DataChannel を使ったブラウザ間 P2P ファイル転送アプリ。
シグナリングサーバーは Cloudflare Workers + Durable Objects、NAT越えは Cloudflare Calls (TURN) を利用。
カスタムドメイン: webrtc-file-exporter.0g0.xyz

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite + Tailwind CSS v4
- **バックエンド**: Cloudflare Workers + Durable Objects
- **通信**: WebSocket (シグナリング) + WebRTC DataChannel (P2P)
- **TURN**: Cloudflare Calls (NAT越え)

## プロジェクト構成

```
webrtc-file-exporter/
├── worker/          # Cloudflare Workers
├── frontend/        # React + TypeScript + Vite
├── .gitignore
├── CLAUDE.md
└── README.md
```

## 開発コマンド

```bash
# Worker 開発
cd worker && npm run dev       # wrangler dev でローカル起動

# フロントエンド開発
cd frontend && npm run dev     # Vite 開発サーバー

# デプロイ
cd frontend && npm run build
cd worker && wrangler deploy
```

## コード規約

- コメント・コミットメッセージは日本語
- TypeScript strict mode
- チャンクサイズ: 64KB
- バッファ閾値: 256KB
