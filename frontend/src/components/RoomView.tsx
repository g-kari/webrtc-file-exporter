import { useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionState, TransferFile } from '../types';
import { SignalingClient } from '../lib/signaling';
import { PeerConnection } from '../lib/webrtc';
import { FileSender } from '../lib/file-sender';
import { FileReceiver } from '../lib/file-receiver';
import ConnectionStatus from './ConnectionStatus';
import FileDrop from './FileDrop';
import FileList from './FileList';

interface Props {
  roomId: string;
}

export default function RoomView({ roomId }: Props) {
  const [wsState, setWsState] = useState<ConnectionState>('disconnected');
  const [rtcState, setRtcState] = useState<ConnectionState>('disconnected');
  const [files, setFiles] = useState<TransferFile[]>([]);

  const signalingRef = useRef<SignalingClient | null>(null);
  const pcRef = useRef<PeerConnection | null>(null);
  const senderRef = useRef<FileSender | null>(null);
  const receiverRef = useRef<FileReceiver | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);

  const updateFile = useCallback((id: string, updates: Partial<TransferFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  // DataChannel が開いたら FileSender/FileReceiver をセットアップ
  const setupDataChannel = useCallback((pc: PeerConnection) => {
    const receiver = new FileReceiver();
    receiverRef.current = receiver;

    receiver.onProgress((fileId, transferred) => {
      updateFile(fileId, { transferred, state: 'transferring' });
    });

    receiver.onComplete((fileId, blobUrl, metadata) => {
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

    pc.onMessage((data) => {
      // file-start メッセージの場合、ファイルリストに追加
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data) as { type: string; fileId: string; name?: string; size?: number; mimeType?: string };
          if (msg.type === 'file-start') {
            setFiles((prev) => {
              if (prev.some((f) => f.id === msg.fileId)) return prev;
              return [...prev, {
                id: msg.fileId,
                name: msg.name ?? 'unknown',
                size: msg.size ?? 0,
                type: msg.mimeType ?? '',
                state: 'transferring' as const,
                transferred: 0,
                direction: 'receive' as const,
              }];
            });
          }
        } catch {
          // パース失敗は無視
        }
      }
      receiver.handleMessage(data);
    });

    senderRef.current = new FileSender(pc);
    setRtcState('connected');
  }, [updateFile]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // TURN クレデンシャル取得
      let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
      try {
        const res = await fetch('/api/turn-credentials');
        if (res.ok) {
          const data = await res.json() as { iceServers: RTCIceServer[] };
          iceServers = data.iceServers;
        }
      } catch {
        // STUN のみで続行
      }
      iceServersRef.current = iceServers;
      if (cancelled) return;

      // シグナリング接続
      const signaling = new SignalingClient(roomId);
      signalingRef.current = signaling;
      setWsState('connecting');

      signaling.onClose(() => {
        if (!cancelled) setWsState('disconnected');
      });

      signaling.onMessage(async (message) => {
        if (cancelled) return;

        if (message.type === 'peer-joined') {
          // 先入室者として Offer を生成（既存接続があれば閉じる）
          pcRef.current?.close();
          const pc = new PeerConnection(iceServersRef.current, (candidate) => {
            signaling.send({ type: 'ice-candidate', candidate });
          });
          pcRef.current = pc;

          pc.onOpen(() => setupDataChannel(pc));
          pc.onClose(() => { if (!cancelled) setRtcState('disconnected'); });

          setRtcState('connecting');
          const offer = await pc.createOffer();
          signaling.send({ type: 'offer', sdp: offer });
        }

        if (message.type === 'offer') {
          // 後入室者として Answer を生成（既存接続があれば閉じる）
          pcRef.current?.close();
          const pc = new PeerConnection(iceServersRef.current, (candidate) => {
            signaling.send({ type: 'ice-candidate', candidate });
          });
          pcRef.current = pc;

          pc.onOpen(() => setupDataChannel(pc));
          pc.onClose(() => { if (!cancelled) setRtcState('disconnected'); });

          setRtcState('connecting');
          const answer = await pc.handleOffer(message.sdp);
          signaling.send({ type: 'answer', sdp: answer });
        }

        if (message.type === 'answer' && pcRef.current) {
          await pcRef.current.handleAnswer(message.sdp);
        }

        if (message.type === 'ice-candidate' && pcRef.current) {
          await pcRef.current.addIceCandidate(message.candidate);
        }

        if (message.type === 'leave') {
          pcRef.current?.close();
          pcRef.current = null;
          if (!cancelled) setRtcState('disconnected');
        }
      });

      try {
        await signaling.connect();
        if (!cancelled) setWsState('connected');
      } catch {
        if (!cancelled) setWsState('failed');
      }
    };

    void init();

    return () => {
      cancelled = true;
      signalingRef.current?.disconnect();
      pcRef.current?.close();
    };
  }, [roomId, setupDataChannel]);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    if (!senderRef.current) return;

    for (const file of newFiles) {
      const fileId = crypto.randomUUID();
      const transferFile: TransferFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        state: 'pending',
        transferred: 0,
        direction: 'send',
      };
      setFiles((prev) => [...prev, transferFile]);

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

  const dataChannelReady = rtcState === 'connected';

  return (
    <div className="flex flex-col gap-6">
      <ConnectionStatus wsState={wsState} rtcState={rtcState} />

      {!dataChannelReady && (
        <p className="text-center text-sm text-gray-500">
          {wsState === 'connected' ? '相手の接続を待っています…' : 'シグナリングサーバーに接続中…'}
        </p>
      )}

      {dataChannelReady && (
        <FileDrop onFiles={(f) => void handleFiles(f)} />
      )}

      <FileList files={files} />
    </div>
  );
}
