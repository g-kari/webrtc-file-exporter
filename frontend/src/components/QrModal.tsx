import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

interface Props {
  url: string;
  open: boolean;
  onClose: () => void;
}

export default function QrModal({ url, open, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 240,
      color: { dark: '#1e293b', light: '#ffffff' },
    });
  }, [open, url]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="presentation"
        className="relative rounded-2xl bg-white p-6 flex flex-col items-center gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-xl leading-none"
          aria-label="閉じる"
        >
          ✕
        </button>
        <canvas ref={canvasRef} />
        <p className="text-xs text-gray-500 break-all max-w-[240px] text-center">{url}</p>
      </div>
    </div>
  );
}
