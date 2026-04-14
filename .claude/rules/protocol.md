---
paths:
  - "frontend/src/lib/**"
  - "frontend/src/types/**"
  - "worker/src/**"
---

# DataChannel プロトコル仕様

## ファイル転送プロトコル

- チャンクサイズ: 64KB
- バックプレッシャー閾値: 256KB（`bufferedAmount > 256KB` で待機）
- フレーム構造: `[36バイト fileId ヘッダー][チャンクデータ]`
- シーケンス: `file-start` (JSON) → チャンク (ArrayBuffer) → `file-end` (JSON)

## テキストクリップ

- メッセージ型: `text-clip`
- フォーマット: `{ type: 'text-clip', clipId: string, text: string }`
- バイナリフレームとは別の JSON メッセージとして送信する
