import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

interface Props {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

// 親は開いている間だけ描画する。閉じる操作は親へ通知し、状態を一元管理する。
export default function Modal({ label, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // DOM から外れる前に閉じ、UA に呼び出し元へのフォーカス復帰を任せる。
    return () => dialog.close();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // closedby 未対応ブラウザ用。Esc は UA の cancel イベントで処理する。
    const handleBackdropClick = (event: MouseEvent) => {
      if (Reflect.has(dialog, 'closedBy') || event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        onClose();
      }
    };
    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      closedby="any"
      className="m-auto max-w-full max-h-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // StrictMode の再表示後に届いた古い close イベントは無視する。
        if (!event.currentTarget.open) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
