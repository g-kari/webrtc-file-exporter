import { useState } from 'react';

interface Props {
  url: string;
  message: string;
  footer?: string;
}

export default function ShareUrlPanel({ url, message, footer }: Props) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // HTTP環境やブラウザ権限拒否時のフォールバック（手動コピーを促す）
    }
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 flex flex-col gap-3">
      <p className="text-sm text-gray-400">{message}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded bg-gray-800 px-3 py-2 text-sm font-mono text-gray-200 outline-none"
        />
        <button
          onClick={() => void copyUrl()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition-colors shrink-0"
        >
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>
      {footer && (
        <p className="text-center text-xs text-gray-500">{footer}</p>
      )}
    </div>
  );
}
