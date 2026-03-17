// ファイル受信：チャンク蓄積 → Blob ダウンロード

import type { FileMetadata } from '../types';

// 受信ファイルの最大サイズ（2GB）：メモリ枯渇 DoS を防ぐ
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

interface ReceivingFile {
  metadata: FileMetadata;
  chunks: ArrayBuffer[];
  received: number;
}

type ProgressHandler = (fileId: string, transferred: number) => void;
type CompleteHandler = (fileId: string, blobUrl: string, metadata: FileMetadata) => void;

export class FileReceiver {
  private receivingFiles: Map<string, ReceivingFile> = new Map();
  private progressHandlers: ProgressHandler[] = [];
  private completeHandlers: CompleteHandler[] = [];

  /** DataChannel メッセージを処理する */
  handleMessage(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      // JSON 制御メッセージ
      this.handleControlMessage(data);
    } else {
      // バイナリチャンク
      this.handleChunk(data);
    }
  }

  private handleControlMessage(data: string): void {
    let message: { type: string; fileId: string } & Partial<FileMetadata>;
    try {
      message = JSON.parse(data) as typeof message;
    } catch {
      return;
    }

    if (message.type === 'file-start') {
      // メタデータの必須フィールドを検証（相手が偽造した値での無効アクセスを防ぐ）
      if (
        typeof message.name !== 'string' ||
        typeof message.size !== 'number' ||
        typeof message.mimeType !== 'string'
      ) {
        return;
      }
      // ファイルサイズ上限チェック
      if (message.size > MAX_FILE_SIZE) {
        return;
      }
      // 型安全にメタデータを構築
      const metadata: FileMetadata = {
        type: 'file-start',
        fileId: message.fileId,
        name: message.name,
        size: message.size,
        mimeType: message.mimeType,
      };
      this.receivingFiles.set(metadata.fileId, {
        metadata,
        chunks: [],
        received: 0,
      });
    } else if (message.type === 'file-end') {
      // ファイル受信完了
      const fileId = message.fileId;
      const file = this.receivingFiles.get(fileId);
      if (!file) return;

      const blob = new Blob(file.chunks, { type: file.metadata.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      this.receivingFiles.delete(fileId);
      this.completeHandlers.forEach((h) => h(fileId, blobUrl, file.metadata));
    }
  }

  private handleChunk(data: ArrayBuffer): void {
    // 最後に受信中のファイルにチャンクを追加
    // （シンプルな実装: 同時転送は1ファイルのみ想定）
    const file = this.receivingFiles.values().next().value;
    if (!file) return;
    // 宣言サイズ超過チェック：悪意ある相手による無制限データ送信を防ぐ
    if (file.received + data.byteLength > file.metadata.size + 1024) {
      return;
    }
    file.chunks.push(data);
    file.received += data.byteLength;
    this.progressHandlers.forEach((h) => h(file.metadata.fileId, file.received));
  }

  /** 進捗ハンドラを登録する */
  onProgress(handler: ProgressHandler): void {
    this.progressHandlers.push(handler);
  }

  /** 完了ハンドラを登録する */
  onComplete(handler: CompleteHandler): void {
    this.completeHandlers.push(handler);
  }
}
