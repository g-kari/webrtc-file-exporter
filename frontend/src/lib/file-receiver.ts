// ファイル受信：チャンク蓄積 → Blob ダウンロード

import type { FileMetadata } from '../types';
import { FILE_ID_HEADER_SIZE } from './file-sender';

// 受信ファイルの最大サイズ（2GB）：メモリ枯渇 DoS を防ぐ
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

interface ReceivingFile {
  metadata: FileMetadata;
  chunks: ArrayBuffer[];
  received: number;
}

type StartHandler = (metadata: FileMetadata) => void;
type ProgressHandler = (fileId: string, transferred: number) => void;
type CompleteHandler = (fileId: string, blobUrl: string, metadata: FileMetadata) => void;

export class FileReceiver {
  private receivingFiles: Map<string, ReceivingFile> = new Map();
  private startHandlers: StartHandler[] = [];
  private progressHandlers: ProgressHandler[] = [];
  private completeHandlers: CompleteHandler[] = [];

  /** DataChannel メッセージを処理する */
  handleMessage(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      this.handleControlMessage(data);
    } else {
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
      this.startHandlers.forEach((h) => h(metadata));
    } else if (message.type === 'file-end') {
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
    // バイナリフレーム構造: [36バイト fileId][チャンクデータ]
    if (data.byteLength <= FILE_ID_HEADER_SIZE) return;

    const fileId = new TextDecoder().decode(data.slice(0, FILE_ID_HEADER_SIZE));
    const chunk = data.slice(FILE_ID_HEADER_SIZE);

    const file = this.receivingFiles.get(fileId);
    if (!file) return;

    // 宣言サイズ超過チェック：悪意ある相手による無制限データ送信を防ぐ
    if (file.received + chunk.byteLength > file.metadata.size + 1024) {
      return;
    }

    file.chunks.push(chunk);
    file.received += chunk.byteLength;
    this.progressHandlers.forEach((h) => h(fileId, file.received));
  }

  /** 受信開始ハンドラを登録する */
  onStart(handler: StartHandler): void {
    this.startHandlers.push(handler);
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
