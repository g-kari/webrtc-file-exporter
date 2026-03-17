import { useState } from 'react';
import { getRoomShareUrl } from '../lib/room';
import ShareUrlPanel from './ShareUrlPanel';

export default function RoomCreate() {
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const createRoom = () => {
    const roomId = crypto.randomUUID();
    setShareUrl(getRoomShareUrl(roomId));
    window.location.hash = `/${roomId}`;
  };

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div>
        <h2 className="text-2xl font-semibold mb-2">P2P ファイル転送</h2>
        <p className="text-gray-400">ルームを作成して URL を共有するだけで、ブラウザ間で直接ファイルを転送できます。</p>
      </div>
      {!shareUrl ? (
        <button
          onClick={createRoom}
          className="rounded-lg bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500 transition-colors"
        >
          ルームを作成
        </button>
      ) : (
        <div className="w-full">
          <ShareUrlPanel url={shareUrl} message="相手にこの URL を共有してください" />
        </div>
      )}
    </div>
  );
}
