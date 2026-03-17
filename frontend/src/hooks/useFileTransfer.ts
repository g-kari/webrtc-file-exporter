import { useState, useRef, useCallback } from 'react';
import type { TransferFile } from '../types';
import { FileReceiver } from '../lib/file-receiver';
import { FileSender } from '../lib/file-sender';
import type { PeerConnection } from '../lib/webrtc';

export function useFileTransfer() {
  const [files, setFiles] = useState<TransferFile[]>([]);
  const senderRef = useRef<FileSender | null>(null);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  const updateFile = useCallback((id: string, updates: Partial<TransferFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  /** DataChannel が開いたときに呼ぶ。FileSender/FileReceiver をセットアップする */
  const setupDataChannel = useCallback((pc: PeerConnection) => {
    const receiver = new FileReceiver();

    receiver.onStart((metadata) => {
      setFiles((prev) => {
        if (prev.some((f) => f.id === metadata.fileId)) return prev;
        return [...prev, {
          id: metadata.fileId,
          name: metadata.name,
          size: metadata.size,
          type: metadata.mimeType,
          state: 'transferring' as const,
          transferred: 0,
          direction: 'receive' as const,
        }];
      });
    });

    receiver.onProgress((fileId, transferred) => {
      updateFile(fileId, { transferred, state: 'transferring' });
    });

    receiver.onComplete((fileId, blobUrl, metadata) => {
      blobUrlsRef.current.set(fileId, blobUrl);
      setFiles((prev) => {
        const exists = prev.some((f) => f.id === fileId);
        if (!exists) {
          return [...prev, {
            id: fileId,
            name: metadata.name,
            size: metadata.size,
            type: metadata.mimeType,
            state: 'completed' as const,
            transferred: metadata.size,
            blobUrl,
            direction: 'receive' as const,
          }];
        }
        return prev.map((f) =>
          f.id === fileId
            ? { ...f, state: 'completed' as const, blobUrl, transferred: metadata.size }
            : f
        );
      });
    });

    pc.onMessage((data) => receiver.handleMessage(data));
    senderRef.current = new FileSender(pc);
  }, [updateFile]);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    if (!senderRef.current) return;

    for (const file of newFiles) {
      const fileId = crypto.randomUUID();
      setFiles((prev) => [...prev, {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        state: 'pending' as const,
        transferred: 0,
        direction: 'send' as const,
      }]);

      try {
        await senderRef.current.send(file, fileId, (transferred) => {
          updateFile(fileId, { transferred, state: 'transferring' });
        });
        updateFile(fileId, { state: 'completed', transferred: file.size });
      } catch {
        updateFile(fileId, { state: 'error' });
      }
    }
  }, [updateFile]);

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

  return { files, setupDataChannel, handleFiles, handleDownload, revokeBlobUrls };
}
