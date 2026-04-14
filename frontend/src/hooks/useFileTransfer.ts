import { useCallback, useRef, useState } from 'react';
import { FileReceiver } from '../lib/file-receiver';
import { FileSender } from '../lib/file-sender';
import type { PeerConnection } from '../lib/webrtc';
import type { TextClipMessage, TransferFile } from '../types';

export interface TextClip {
  id: string;
  text: string;
  direction: 'send' | 'receive';
  createdAt: number;
}

export function useFileTransfer() {
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [textClips, setTextClips] = useState<TextClip[]>([]);
  const senderRef = useRef<FileSender | null>(null);
  const pcRef = useRef<PeerConnection | null>(null);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  const updateFile = useCallback((id: string, updates: Partial<TransferFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  /** DataChannel が開いたときに呼ぶ。FileSender/FileReceiver をセットアップする */
  const setupDataChannel = useCallback(
    (pc: PeerConnection) => {
      pcRef.current = pc;
      const receiver = new FileReceiver();

      receiver.onStart((metadata) => {
        setFiles((prev) => {
          if (prev.some((f) => f.id === metadata.fileId)) return prev;
          return [
            ...prev,
            {
              id: metadata.fileId,
              name: metadata.name,
              size: metadata.size,
              type: metadata.mimeType,
              state: 'transferring' as const,
              transferred: 0,
              direction: 'receive' as const,
            },
          ];
        });
      });

      receiver.onProgress((fileId, transferred) => {
        updateFile(fileId, { transferred, state: 'transferring' });
      });

      // onStart が必ず先行するため、既存エントリへの更新のみ行う
      receiver.onComplete((fileId, blobUrl, metadata) => {
        blobUrlsRef.current.set(fileId, blobUrl);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, state: 'completed' as const, blobUrl, transferred: metadata.size }
              : f,
          ),
        );
      });

      pc.onMessage((data) => {
        // テキストメッセージの場合、text-clip を先に判定して FileReceiver には渡さない
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data) as { type?: string };
            if (parsed.type === 'text-clip') {
              const msg = parsed as TextClipMessage;
              setTextClips((prev) => [
                ...prev,
                { id: msg.clipId, text: msg.text, direction: 'receive', createdAt: Date.now() },
              ]);
              return;
            }
          } catch {
            // JSON パース失敗は FileReceiver に任せる
          }
        }
        receiver.handleMessage(data);
      });

      senderRef.current = new FileSender(pc);
    },
    [updateFile],
  );

  /** テキストを DataChannel 経由で送信する */
  const sendText = useCallback((text: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    const clipId = crypto.randomUUID();
    const msg: TextClipMessage = { type: 'text-clip', clipId, text };
    pc.send(JSON.stringify(msg));
    setTextClips((prev) => [
      ...prev,
      { id: clipId, text, direction: 'send', createdAt: Date.now() },
    ]);
  }, []);

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      // スナップショットを取得して並列処理中の null 競合を防ぐ
      const sender = senderRef.current;
      if (!sender) return;

      // 全ファイルを先にリストに追加してから並列送信
      const transfers = newFiles.map((file) => ({ file, fileId: crypto.randomUUID() }));

      setFiles((prev) => [
        ...prev,
        ...transfers.map(({ file, fileId }) => ({
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          state: 'pending' as const,
          transferred: 0,
          direction: 'send' as const,
        })),
      ]);

      await Promise.all(
        transfers.map(async ({ file, fileId }) => {
          try {
            await sender.send(file, fileId, (transferred) => {
              updateFile(fileId, { transferred, state: 'transferring' });
            });
            updateFile(fileId, { state: 'completed', transferred: file.size });
          } catch {
            updateFile(fileId, { state: 'error' });
          }
        }),
      );
    },
    [updateFile],
  );

  const handleDownload = useCallback((fileId: string) => {
    const url = blobUrlsRef.current.get(fileId);
    if (url) {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(fileId);
    }
  }, []);

  /** アンマウント時に Blob URL をすべて解放する */
  const revokeBlobUrls = useCallback(() => {
    for (const url of blobUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current.clear();
  }, []);

  return {
    files,
    textClips,
    setupDataChannel,
    sendText,
    handleFiles,
    handleDownload,
    revokeBlobUrls,
  };
}
