# CLAUDE.md

## 開発コマンド

```bash
# Worker 開発
cd worker && npm run dev         # wrangler dev でローカル起動
cd worker && npm run type-check  # TypeScript 型チェック

# フロントエンド開発
cd frontend && npm run dev       # Vite 開発サーバー
cd frontend && npm run type-check
cd frontend && npm run build     # 本番ビルド

# デプロイ（順序重要）
cd frontend && npm run build
cd worker && wrangler deploy
```

## Worker 環境変数（secrets）

```bash
cd worker
wrangler secret put TURN_KEY_ID        # Cloudflare Calls TURN Key ID
wrangler secret put TURN_KEY_API_TOKEN # Cloudflare Calls API Token
```

## コード規約

- コメント・コミットメッセージは日本語
- TypeScript strict mode
- **実装は TDD で行う**（テストを先に書いてから実装する）
