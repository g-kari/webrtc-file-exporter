import { useWebRTC } from '../hooks/useWebRTC';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { getRoomShareUrl } from '../lib/room';
import ConnectionStatus from './ConnectionStatus';
import FileDrop from './FileDrop';
import FileList from './FileList';
import ShareUrlPanel from './ShareUrlPanel';

interface Props {
  roomId: string;
}

export default function RoomView({ roomId }: Props) {
  const { files, setupDataChannel, handleFiles, handleDownload, revokeBlobUrls } = useFileTransfer();
  const { wsState, rtcState } = useWebRTC(roomId, setupDataChannel, revokeBlobUrls);

  const dataChannelReady = rtcState === 'connected';
  const shareUrl = getRoomShareUrl(roomId);
  const wsFooter = wsState === 'connected' ? '相手の接続を待っています…' : 'シグナリングサーバーに接続中…';

  return (
    <div className="flex flex-col gap-6">
      <ConnectionStatus wsState={wsState} rtcState={rtcState} />

      {wsState === 'room-full' && <RoomFullBanner />}

      {!dataChannelReady && wsState !== 'room-full' && (
        <ShareUrlPanel
          url={shareUrl}
          message="このURLを相手に共有してください"
          footer={wsFooter}
        />
      )}

      {dataChannelReady && (
        <FileDrop onFiles={(f) => void handleFiles(f)} />
      )}

      <FileList files={files} onDownload={handleDownload} />
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
