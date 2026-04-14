import { useState } from 'react';
import type { TextClip } from '../hooks/useFileTransfer';
import { useToast } from '../hooks/useToast';
import type { TransferFile } from '../types';
import ImageModal from './ImageModal';

interface Props {
  files: TransferFile[];
  textClips: TextClip[];
  onDownload?: (fileId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FilePreview({
  file,
  onClickImage,
}: { file: TransferFile; onClickImage: (src: string, name: string) => void }) {
  if (!file.blobUrl) return null;
  const t = file.type;
  const blobUrl = file.blobUrl;

  // SVG は <img> タグ経由でもスクリプト実行の可能性があるためプレビュー対象から除外
  if (t.startsWith('image/') && t !== 'image/svg+xml') {
    return (
      <button
        type="button"
        onClick={() => onClickImage(blobUrl, file.name)}
        className="block bg-transparent p-0 border-0"
      >
        <img
          src={blobUrl}
          alt={file.name}
          className="mt-2 max-h-48 rounded hover:opacity-90 transition-opacity"
        />
      </button>
    );
  }
  if (t.startsWith('video/')) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: ユーザーがアップロードした動的コンテンツのためキャプション不要
      <video src={blobUrl} controls className="mt-2 max-h-48 rounded" />
    );
  }
  if (t.startsWith('audio/')) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: ユーザーがアップロードした動的コンテンツのためキャプション不要
      <audio src={blobUrl} controls className="mt-2 w-full" />
    );
  }
  return null;
}

export default function FileList({ files, textClips, onDownload }: Props) {
  const [modalSrc, setModalSrc] = useState<string | null>(null);
  const [modalAlt, setModalAlt] = useState('');
  const showToast = useToast();

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('クリップボードにコピーしました');
    } catch {
      showToast('コピーに失敗しました', true);
    }
  };

  if (files.length === 0 && textClips.length === 0) return null;

  // 時系列順にマージ（ファイルは createdAt がないので追加順を維持）
  return (
    <>
      <ul className="flex flex-col gap-3">
        {/* テキストクリップ */}
        {textClips.map((clip) => (
          <li key={clip.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <span className="text-xs rounded bg-gray-800 px-2 py-0.5 text-gray-400 shrink-0">
                {clip.direction === 'send' ? '送信' : '受信'}
              </span>
              {clip.direction === 'receive' && (
                <button
                  type="button"
                  onClick={() => void handleCopyText(clip.text)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                >
                  コピー
                </button>
              )}
            </div>
            <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{clip.text}</p>
          </li>
        ))}

        {/* ファイル転送 */}
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
                <span className="ml-4 text-xs text-gray-500 shrink-0">
                  {formatBytes(file.size)}
                </span>
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
                  <FilePreview
                    file={file}
                    onClickImage={(src, alt) => {
                      setModalSrc(src);
                      setModalAlt(alt);
                    }}
                  />
                  <a
                    href={file.blobUrl}
                    download={file.name.replace(/[/\\:*?"<>|]/g, '_')}
                    className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => {
                      setTimeout(() => onDownload?.(file.id), 0);
                    }}
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

      <ImageModal src={modalSrc} alt={modalAlt} onClose={() => setModalSrc(null)} />
    </>
  );
}
