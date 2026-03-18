import { useState, useRef, useEffect } from 'react';
import type { ConnectionState } from '../types';
import { SignalingClient } from '../lib/signaling';
import { PeerConnection } from '../lib/webrtc';
import { createLogger } from '../lib/logger';

const { warn } = createLogger('useWebRTC');

/** TURN クレデンシャルを取得する。失敗時は STUN のみを返す */
async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/turn-credentials');
    if (res.ok) {
      const data = await res.json() as { iceServers?: RTCIceServer[] };
      if (Array.isArray(data.iceServers)) return data.iceServers;
    }
  } catch {
    // STUN のみで続行
  }
  return [{ urls: 'stun:stun.cloudflare.com:3478' }];
}

export function useWebRTC(
  roomId: string,
  onDataChannelOpen: (pc: PeerConnection) => void,
  onCleanup: () => void,
) {
  const [wsState, setWsState] = useState<ConnectionState>('disconnected');
  const [rtcState, setRtcState] = useState<ConnectionState>('disconnected');

  const signalingRef = useRef<SignalingClient | null>(null);
  const pcRef = useRef<PeerConnection | null>(null);

  // コールバックを ref で保持することで effect の依存配列から除外し、
  // roomId 変更時のみ再接続するようにする（stable ref パターン）
  const onDataChannelOpenRef = useRef(onDataChannelOpen);
  const onCleanupRef = useRef(onCleanup);
  onDataChannelOpenRef.current = onDataChannelOpen;
  onCleanupRef.current = onCleanup;

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const iceServers = await fetchIceServers();
      if (cancelled) return;

      const createPeerConnection = (signaling: SignalingClient): PeerConnection => {
        pcRef.current?.close();
        const pc = new PeerConnection(iceServers, (candidate) => {
          signaling.send({ type: 'ice-candidate', candidate });
        });
        pcRef.current = pc;
        pc.onOpen(() => {
          if (!cancelled) setRtcState('connected');
          onDataChannelOpenRef.current(pc);
        });
        pc.onClose(() => { if (!cancelled) setRtcState('disconnected'); });
        setRtcState('connecting');
        return pc;
      };

      const signaling = new SignalingClient(roomId);
      signalingRef.current = signaling;
      setWsState('connecting');

      signaling.onClose(() => {
        if (!cancelled) {
          setWsState('disconnected');
          if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
            setRtcState('disconnected');
          }
        }
      });

      signaling.onRoomFull(() => {
        if (!cancelled) setWsState('room-full');
      });

      signaling.onMessage(async (message) => {
        if (cancelled) return;
        try {
          switch (message.type) {
            case 'peer-joined': {
              const pc = createPeerConnection(signaling);
              const offer = await pc.createOffer();
              if (cancelled) return;
              signaling.send({ type: 'offer', sdp: offer });
              break;
            }
            case 'offer': {
              const pc = createPeerConnection(signaling);
              const answer = await pc.handleOffer(message.sdp);
              if (cancelled) return;
              signaling.send({ type: 'answer', sdp: answer });
              break;
            }
            case 'answer':
              if (pcRef.current) await pcRef.current.handleAnswer(message.sdp);
              break;
            case 'ice-candidate':
              if (pcRef.current) await pcRef.current.addIceCandidate(message.candidate);
              break;
            case 'leave':
              pcRef.current?.close();
              pcRef.current = null;
              if (!cancelled) setRtcState('disconnected');
              break;
            case 'joined':
              // サーバー確認応答 — 処理不要
              break;
          }
        } catch (err) {
          warn('シグナリングメッセージ処理エラー:', err);
          if (!cancelled) setRtcState('failed');
        }
      });

      try {
        await signaling.connect();
        if (!cancelled) {
          setWsState('connected');
          signaling.send({ type: 'join' });
        }
      } catch {
        if (!cancelled) setWsState('failed');
      }
    };

    void init();

    return () => {
      cancelled = true;
      signalingRef.current?.disconnect();
      pcRef.current?.close();
      onCleanupRef.current();
    };
  }, [roomId]);

  return { wsState, rtcState };
}
