// ファイル受信：チャンク蓄積 → Blob ダウンロード

import type { FileMetadata } from '../types';
import { FILE_ID_HEADER_SIZE } from '../types';
import { createLogger } from './logger';

const { log, warn } = createLogger('FileReceiver');

// 受信ファイルの最大サイズ（2GB）：メモリ枯渇 DoS を防ぐ
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

// モジュールスコープで一度だけ生成（チャンクごとの生成コストを削減）
const TEXT_DECODER = new TextDecoder();

interface ReceivingFile {
  metadata: FileMetadata;
  chunks: ArrayBuffer[];
  received: number;
}

type StartHandler = (metadata: FileMetadata) => void;
type ProgressHandler = (fileId: string, transferred: number) => void;
type CompleteHandler = (fileId: string, blobUrl: string, metadata: FileMetadata) => void;

/** DataChannel から受け取ったテキストフレームのパース結果 */
type ParsedControlMessage = { type: string; fileId: string } & Partial<FileMetadata>;

/** file-start メッセージの必須フィールドを検証する型ガード */
function isValidFileStart(
  msg: { type: string; fileId: string } & Partial<FileMetadata>
): msg is FileMetadata {
  return (
    typeof msg.fileId === 'string' && msg.fileId !== '' &&
    typeof msg.name === 'string' &&
    typeof msg.size === 'number' &&
    typeof msg.mimeType === 'string' &&
    msg.size <= MAX_FILE_SIZE
  );
}

export class FileReceiver {
  private receivingFiles: Map<string, ReceivingFile> = new Map();
  private startCallback: StartHandler | null = null;
  private progressCallback: ProgressHandler | null = null;
  private completeCallback: CompleteHandler | null = null;

  /** DataChannel メッセージを処理する */
  handleMessage(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      this.handleControlMessage(data);
    } else {
      this.handleChunk(data);
    }
  }

  private handleControlMessage(data: string): void {
    let message: ParsedControlMessage;
    try {
      message = JSON.parse(data) as ParsedControlMessage;
    } catch {
      return;
    }

    if (message.type === 'file-start') {
      // 必須フィールドの型検証（相手が偽造した値での無効アクセスを防ぐ）
      if (!isValidFileStart(message)) {
        warn('file-start バリデーション失敗:', JSON.stringify(message));
        return;
      }

      log(`受信開始: ${message.name} (${message.size} bytes) fileId=${message.fileId}`);
      this.receivingFiles.set(message.fileId, {
        metadata: message,
        chunks: [],
        received: 0,
      });
      this.startCallback?.(message);
    } else if (message.type === 'file-end') {
      const fileId = message.fileId;
      const file = this.receivingFiles.get(fileId);
      if (!file) return;

      log(`受信完了: ${file.metadata.name} fileId=${fileId}`);
      const blob = new Blob(file.chunks, { type: file.metadata.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      this.receivingFiles.delete(fileId);
      this.completeCallback?.(fileId, blobUrl, file.metadata);
    }
  }

  private handleChunk(data: ArrayBuffer): void {
    // バイナリフレーム構造: [36バイト fileId][チャンクデータ]
    if (data.byteLength <= FILE_ID_HEADER_SIZE) return;

    // コピーなしに fileId を読み取る（TypedArray(buffer, byteOffset, length) 構文）
    const fileId = TEXT_DECODER.decode(new Uint8Array(data, 0, FILE_ID_HEADER_SIZE));
    const chunk = data.slice(FILE_ID_HEADER_SIZE);

    const file = this.receivingFiles.get(fileId);
    if (!file) return;

    // 宣言サイズ超過チェック：悪意ある相手による無制限データ送信を防ぐ
    if (file.received + chunk.byteLength > file.metadata.size + 1024) {
      warn(`サイズ超過チェック失敗 fileId=${fileId} received=${file.received} chunk=${chunk.byteLength}`);
      return;
    }

    file.chunks.push(chunk);
    file.received += chunk.byteLength;
    this.progressCallback?.(fileId, file.received);
  }

  /** 受信開始ハンドラを登録する */
  onStart(handler: StartHandler): void {
    this.startCallback = handler;
  }

  /** 進捗ハンドラを登録する */
  onProgress(handler: ProgressHandler): void {
    this.progressCallback = handler;
  }

  /** 完了ハンドラを登録する */
  onComplete(handler: CompleteHandler): void {
    this.completeCallback = handler;
  }
}
