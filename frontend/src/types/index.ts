// 共通型定義

// 接続状態
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'room-full'
  | 'failed';

// ファイル転送状態
export type TransferState = 'pending' | 'transferring' | 'completed' | 'error';

// 転送ファイル情報
export interface TransferFile {
  id: string;
  name: string;
  size: number;
  type: string;
  state: TransferState;
  /** 転送済みバイト数 */
  transferred: number;
  /** 受信済み Blob URL（受信完了後） */
  blobUrl?: string;
  /** 送信 or 受信 */
  direction: 'send' | 'receive';
}

// シグナリングメッセージ型
export type SignalingMessage =
  | { type: 'joined'; peerId: string }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; fromPeerId: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; fromPeerId: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; fromPeerId: string }
  | { type: 'leave'; peerId: string };

// ファイルメタデータ（DataChannel プロトコル）
export interface FileMetadata {
  type: 'file-start';
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface FileChunkAck {
  type: 'file-end';
  fileId: string;
}
