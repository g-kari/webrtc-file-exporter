import { useState, useRef, useEffect } from 'react';
import type { ConnectionState } from '../types';
import { SignalingClient } from '../lib/signaling';
import { PeerConnection } from '../lib/webrtc';

const warn = (...args: unknown[]) =>
  console.warn('[useWebRTC]', ...args);

export function useWebRTC(
  roomId: string,
  onDataChannelOpen: (pc: PeerConnection) => void,
  onBeforeUnmount: () => void,
) {
  const [wsState, setWsState] = useState<ConnectionState>('disconnected');
  const [rtcState, setRtcState] = useState<ConnectionState>('disconnected');

  const signalingRef = useRef<SignalingClient | null>(null);
  const pcRef = useRef<PeerConnection | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);

  // コールバックを ref で保持することで effect の依存配列から除外し、
  // roomId 変更時のみ再接続するようにする（stable ref パターン）
  const onDataChannelOpenRef = useRef(onDataChannelOpen);
  const onBeforeUnmountRef = useRef(onBeforeUnmount);
  onDataChannelOpenRef.current = onDataChannelOpen;
  onBeforeUnmountRef.current = onBeforeUnmount;

  useEffect(() => {
    let cancelled = false;

    const createPeerConnection = (signaling: SignalingClient): PeerConnection => {
      pcRef.current?.close();
      const pc = new PeerConnection(iceServersRef.current, (candidate) => {
        signaling.send({ type: 'ice-candidate', candidate });
      });
      pcRef.current = pc;
      pc.onOpen(() => onDataChannelOpenRef.current(pc));
      pc.onClose(() => { if (!cancelled) setRtcState('disconnected'); });
      setRtcState('connecting');
      return pc;
    };

    const init = async () => {
      // TURN クレデンシャル取得
      let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
      try {
        const res = await fetch('/api/turn-credentials');
        if (res.ok) {
          const data = await res.json() as { iceServers?: RTCIceServer[] };
          if (Array.isArray(data.iceServers)) iceServers = data.iceServers;
        }
      } catch {
        // STUN のみで続行
      }
      iceServersRef.current = iceServers;
      if (cancelled) return;

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
          if (message.type === 'peer-joined') {
            const pc = createPeerConnection(signaling);
            const offer = await pc.createOffer();
            if (cancelled) return;
            signaling.send({ type: 'offer', sdp: offer });
          }

          if (message.type === 'offer') {
            const pc = createPeerConnection(signaling);
            const answer = await pc.handleOffer(message.sdp);
            if (cancelled) return;
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
      onBeforeUnmountRef.current();
    };
  }, [roomId]);

  return { wsState, rtcState };
}
