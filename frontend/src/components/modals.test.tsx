import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QRCode from 'qrcode';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageModal from './ImageModal';
import QrModal from './QrModal';

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));

const image = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const url = 'https://synthetic.example/#/test-room';
const fixtures = [
  {
    name: 'ImageModal',
    label: '画像プレビュー',
    render: (open: boolean, onClose: () => void) => (
      <ImageModal src={open ? image : null} alt="合成画像" onClose={onClose} />
    ),
    content: () => screen.getByAltText('合成画像'),
  },
  {
    name: 'QrModal',
    label: '共有用QRコード',
    render: (open: boolean, onClose: () => void) => (
      <QrModal url={url} open={open} onClose={onClose} />
    ),
    content: () => screen.getByText(url),
  },
];

// jsdom は top layer、inert、フォーカス制御、Esc の既定動作を実装しない。
// ここでは API 呼び出しと open 属性、遅延 close イベントだけを模擬する。
// 実ブラウザのキーボード操作やフォーカス復帰の検証を代替しない。
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
let pendingCloseEvents: HTMLDialogElement[];
beforeEach(() => {
  pendingCloseEvents = [];
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true;
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        if (!this.open) return;
        this.open = false;
        pendingCloseEvents.push(this);
      }),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const [name, descriptor] of [
    ['showModal', originalShowModal],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

function flushCloseEvents() {
  for (const dialog of pendingCloseEvents.splice(0)) fireEvent(dialog, new Event('close'));
}

function getDialog(label: string) {
  const dialog = screen.getByRole('dialog', { name: label });
  if (!(dialog instanceof HTMLDialogElement)) throw new Error('dialog 要素ではありません');
  return dialog;
}

function mockBounds(dialog: HTMLDialogElement) {
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 200));
}

function Harness({
  fixture,
  onClose,
}: {
  fixture: (typeof fixtures)[number];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      {fixture.render(open, () => {
        onClose();
        setOpen(false);
      })}
    </>
  );
}

describe.each(fixtures)('$name', (fixture) => {
  function openModal(onClose = vi.fn()) {
    render(<Harness fixture={fixture} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    return { dialog: getDialog(fixture.label), onClose };
  }

  it('閉じた状態では表示せず、名前付きのネイティブ dialog を showModal で開く', () => {
    const onClose = vi.fn();
    const { rerender } = render(fixture.render(false, onClose));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    rerender(fixture.render(true, onClose));
    const dialog = getDialog(fixture.label);
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAttribute('closedby', 'any');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    rerender(fixture.render(true, vi.fn()));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  it('内容とパネル余白のクリックでは閉じず、閉じるボタンで一度だけ通知する', () => {
    const { dialog, onClose } = openModal();
    mockBounds(dialog);
    fireEvent.click(fixture.content());
    fireEvent.click(dialog, { clientX: 150, clientY: 150 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    flushCloseEvents();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    expect(getDialog(fixture.label).open).toBe(true);
  });

  it('closedby 未対応環境ではパネル外の背景クリックだけで閉じる', () => {
    const { dialog, onClose } = openModal();
    mockBounds(dialog);
    expect('closedBy' in HTMLDialogElement.prototype).toBe(false);
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closedby 対応環境では背景クリックを UA に任せ、close から親状態を更新する', () => {
    const { dialog, onClose } = openModal();
    // ネイティブ対応を示すプロパティだけを一時的に追加する。
    Object.defineProperty(dialog, 'closedBy', { configurable: true, value: 'any' });
    mockBounds(dialog);
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(onClose).not.toHaveBeenCalled();
    dialog.close();
    flushCloseEvents();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape 相当の cancel を親の close 要求として一度だけ処理し、再度開ける', () => {
    const { dialog, onClose } = openModal();
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    flushCloseEvents();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    expect(getDialog(fixture.label).open).toBe(true);
  });

  it('親が非表示にした場合は通知せず、DOM から削除する前に close を呼ぶ', () => {
    const onClose = vi.fn();
    const { rerender } = render(fixture.render(true, onClose));
    const dialog = getDialog(fixture.label);
    let connectedWhenClosed = false;
    vi.mocked(dialog.close).mockImplementationOnce(function (this: HTMLDialogElement) {
      connectedWhenClosed = this.isConnected;
      this.open = false;
      pendingCloseEvents.push(this);
    });
    rerender(fixture.render(false, onClose));
    expect(connectedWhenClosed).toBe(true);
    expect(dialog.open).toBe(false);
    flushCloseEvents();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('StrictMode の再セットアップ後に遅れた close が届いても開いたまま保つ', () => {
    const onClose = vi.fn();
    render(<StrictMode>{fixture.render(true, onClose)}</StrictMode>);
    const dialog = getDialog(fixture.label);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
    expect(dialog.open).toBe(true);
    flushCloseEvents();
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('アンマウント時に close で UA のフォーカス復帰処理を開始する', () => {
    const { unmount } = render(fixture.render(true, vi.fn()));
    const dialog = getDialog(fixture.label);
    unmount();
    expect(dialog.open).toBe(false);
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  });
});

it('QR は開いた時と URL の変更時だけ生成し直す', () => {
  const onClose = vi.fn();
  const { rerender } = render(<QrModal url={url} open={false} onClose={onClose} />);
  expect(QRCode.toCanvas).not.toHaveBeenCalled();
  rerender(<QrModal url={url} open onClose={onClose} />);
  expect(QRCode.toCanvas).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), url, {
    width: 240,
    color: { dark: '#1e293b', light: '#ffffff' },
  });
  rerender(<QrModal url={`${url}-new`} open onClose={onClose} />);
  expect(QRCode.toCanvas).toHaveBeenCalledTimes(2);
  expect(screen.getByText(`${url}-new`)).toBeInTheDocument();
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
});
