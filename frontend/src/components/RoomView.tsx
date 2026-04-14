import { useState } from 'react';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { useWebRTC } from '../hooks/useWebRTC';
import { getRoomShareUrl } from '../lib/room';
import ConnectionStatus from './ConnectionStatus';
import FileDrop from './FileDrop';
import FileList from './FileList';
import QrModal from './QrModal';
import ShareUrlPanel from './ShareUrlPanel';
import TextInput from './TextInput';

interface Props {
  roomId: string;
}

export default function RoomView({ roomId }: Props) {
  const {
    files,
    textClips,
    setupDataChannel,
    sendText,
    handleFiles,
    handleDownload,
    revokeBlobUrls,
  } = useFileTransfer();
  const { wsState, rtcState } = useWebRTC(roomId, setupDataChannel, revokeBlobUrls);
  const [qrOpen, setQrOpen] = useState(false);

  const dataChannelReady = rtcState === 'connected';
  const shareUrl = getRoomShareUrl(roomId);
  const wsFooter =
    wsState === 'connected' ? '相手の接続を待っています…' : 'シグナリングサーバーに接続中…';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = '';
          }}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← トップへ戻る
        </button>
      </div>
      <ConnectionStatus wsState={wsState} rtcState={rtcState} />

      {wsState === 'room-full' && <RoomFullBanner />}

      {!dataChannelReady && wsState !== 'room-full' && (
        <div className="flex gap-2 items-stretch">
          <div className="flex-1">
            <ShareUrlPanel
              url={shareUrl}
              message="このURLを相手に共有してください"
              footer={wsFooter}
            />
          </div>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 hover:bg-gray-800 transition-colors text-sm text-gray-400 hover:text-white shrink-0"
            title="QRコードを表示"
          >
            QR
          </button>
        </div>
      )}

      {dataChannelReady && (
        <>
          <TextInput onSendText={sendText} onFiles={(f) => void handleFiles(f)} />
          <FileDrop onFiles={(f) => void handleFiles(f)} />
        </>
      )}

      <FileList files={files} textClips={textClips} onDownload={handleDownload} />

      <QrModal url={shareUrl} open={qrOpen} onClose={() => setQrOpen(false)} />
    </div>
  );
}

function RoomFullBanner() {
  return (
    <div className="rounded-lg border border-orange-700 bg-orange-950 p-4 text-center">
      <p className="text-sm text-orange-300 font-semibold">このルームは既に2人が接続中です。</p>
      <p className="text-xs text-orange-400 mt-1">新しいルームを作成してください。</p>
    </div>
  );
}
