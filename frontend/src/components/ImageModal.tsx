import Modal from './Modal';

interface Props {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export default function ImageModal({ src, alt, onClose }: Props) {
  if (!src) return null;

  return (
    <Modal label="画像プレビュー" onClose={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
        aria-label="閉じる"
      >
        ✕
      </button>
      <img
        src={src}
        alt={alt ?? ''}
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
      />
    </Modal>
  );
}
