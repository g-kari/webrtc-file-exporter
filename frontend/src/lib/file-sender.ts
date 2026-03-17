// ファイル送信：チャンク分割 + バックプレッシャー制御

import type { PeerConnection } from './webrtc';
import type { FileMetadata, FileChunkAck } from '../types';

const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFER_THRESHOLD = 256 * 1024; // 256KB

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
      this.pc.send(buffer);
      offset += buffer.byteLength;
      onProgress(offset);
    }

    // 完了通知
    const ack: FileChunkAck = { type: 'file-end', fileId };
    this.pc.send(JSON.stringify(ack));
  }
}
