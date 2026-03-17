// ファイル送信：チャンク分割 + バックプレッシャー制御

import type { PeerConnection } from './webrtc';
import type { FileMetadata, FileChunkAck } from '../types';

const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFER_THRESHOLD = 256 * 1024; // 256KB

/** バイナリフレームのヘッダーサイズ（UUID = 36 ASCII バイト） */
export const FILE_ID_HEADER_SIZE = 36;

// モジュールスコープで一度だけ生成（チャンクごとの生成コストを削減）
const TEXT_ENCODER = new TextEncoder();

/** チャンクバイナリに fileId ヘッダーを付与してフレームを作成する */
function frameChunk(fileId: string, buffer: ArrayBuffer): ArrayBuffer {
  const header = TEXT_ENCODER.encode(fileId); // 36 bytes
  const framed = new Uint8Array(FILE_ID_HEADER_SIZE + buffer.byteLength);
  framed.set(header, 0);
  framed.set(new Uint8Array(buffer), FILE_ID_HEADER_SIZE);
  return framed.buffer;
}

export class FileSender {
  constructor(private readonly pc: PeerConnection) {}

  /** ファイルを送信する */
  async send(
    file: File,
    fileId: string,
    onProgress: (transferred: number) => void
  ): Promise<void> {
    // メタデータ送信
    const metadata: FileMetadata = {
      type: 'file-start',
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
    };
    this.pc.send(JSON.stringify(metadata));

    // チャンク分割送信
    let offset = 0;
    while (offset < file.size) {
      // バックプレッシャー制御: バッファが満杯なら待機
      await this.pc.waitForBufferDrain(BUFFER_THRESHOLD);

      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await chunk.arrayBuffer();
      // fileId ヘッダーを付与して送信（複数ファイル同時転送対応）
      this.pc.send(frameChunk(fileId, buffer));
      offset += buffer.byteLength;
      onProgress(offset);
    }

    // 完了通知
    const ack: FileChunkAck = { type: 'file-end', fileId };
    this.pc.send(JSON.stringify(ack));
  }
}
