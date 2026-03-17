import type { TransferFile } from '../types';

interface Props {
  files: TransferFile[];
  onDownload?: (fileId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FilePreview({ file }: { file: TransferFile }) {
  if (!file.blobUrl) return null;
  const t = file.type;

  // SVG は <img> タグ経由でもスクリプト実行の可能性があるためプレビュー対象から除外
  if (t.startsWith('image/') && t !== 'image/svg+xml') {
    return <img src={file.blobUrl} alt={file.name} className="mt-2 max-h-48 rounded" />;
  }
  if (t.startsWith('video/')) {
    return <video src={file.blobUrl} controls className="mt-2 max-h-48 rounded" />;
  }
  if (t.startsWith('audio/')) {
    return <audio src={file.blobUrl} controls className="mt-2 w-full" />;
  }
  return null;
}

export default function FileList({ files, onDownload }: Props) {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {files.map((file) => {
        const progress = file.size > 0 ? Math.min(100, (file.transferred / file.size) * 100) : 0;
        return (
          <li key={file.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs rounded bg-gray-800 px-2 py-0.5 text-gray-400">
                  {file.direction === 'send' ? '送信' : '受信'}
                </span>
                <span className="truncate text-sm font-medium">{file.name}</span>
              </div>
              <span className="ml-4 text-xs text-gray-500 shrink-0">{formatBytes(file.size)}</span>
            </div>
            {file.state === 'transferring' && (
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            {file.state === 'completed' && file.blobUrl && (
              <>
                <FilePreview file={file} />
                <a
                  href={file.blobUrl}
                  download={file.name.replace(/[/\\:*?"<>|]/g, '_')}
                  className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
                  onClick={() => { setTimeout(() => onDownload?.(file.id), 0); }}
                >
                  ダウンロード
                </a>
              </>
            )}
            {file.state === 'completed' && !file.blobUrl && (
              <p className="mt-1 text-xs text-green-400">送信完了</p>
            )}
            {file.state === 'error' && (
              <p className="mt-1 text-xs text-red-400">エラーが発生しました</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
