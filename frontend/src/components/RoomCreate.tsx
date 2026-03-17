import { useState } from 'react';

export default function RoomCreate() {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createRoom = () => {
    const roomId = crypto.randomUUID();
    const url = `${window.location.origin}/#/${roomId}`;
    setShareUrl(url);
    window.location.hash = `/${roomId}`;
  };

  const copyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // HTTP環境やブラウザ権限拒否時のフォールバック（手動コピーを促す）
    }
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
        <div className="w-full rounded-lg border border-gray-700 bg-gray-900 p-4 flex flex-col gap-3">
          <p className="text-sm text-gray-400">相手にこの URL を共有してください</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 rounded bg-gray-800 px-3 py-2 text-sm font-mono text-gray-200 outline-none"
            />
            <button
              onClick={copyUrl}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition-colors"
            >
              {copied ? 'コピー済み' : 'コピー'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
