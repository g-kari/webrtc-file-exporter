import { useRef, useState } from 'react';

interface Props {
  onSendText: (text: string) => void;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function TextInput({ onSendText, onFiles, disabled }: Props) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!e.clipboardData) return;
    const imageFiles: File[] = [];
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      onFiles(imageFiles);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-3 flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        placeholder="テキストを入力（Ctrl+Enter で送信）または画像をペースト..."
        rows={3}
        className="w-full resize-none bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
        >
          ファイル追加
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          送信
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
