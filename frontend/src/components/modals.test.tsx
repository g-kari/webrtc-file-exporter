import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageModal from './ImageModal';
import QrModal from './QrModal';

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));
afterEach(cleanup);

const image = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const url = 'https://synthetic.example/#/test-room';

describe('ImageModal', () => {
  it('閉じた状態では表示せず、再度開ける', () => {
    const onClose = vi.fn();
    const { rerender } = render(<ImageModal src={null} alt="合成画像" onClose={onClose} />);
    expect(screen.queryByAltText('合成画像')).not.toBeInTheDocument();
    rerender(<ImageModal src={image} alt="合成画像" onClose={onClose} />);
    expect(screen.getByAltText('合成画像')).toBeInTheDocument();
    rerender(<ImageModal src={null} alt="合成画像" onClose={onClose} />);
    rerender(<ImageModal src={image} alt="合成画像" onClose={onClose} />);
    expect(screen.getByAltText('合成画像')).toBeInTheDocument();
  });

  it('画像内のクリックでは閉じず、閉じるボタンで一度だけ通知する', () => {
    const onClose = vi.fn();
    render(<ImageModal src={image} alt="合成画像" onClose={onClose} />);
    fireEvent.click(screen.getByAltText('合成画像'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('背景クリックとEscapeで閉じる', () => {
    const onClose = vi.fn();
    const { container } = render(<ImageModal src={image} alt="合成画像" onClose={onClose} />);
    const backdrop = container.firstElementChild;
    expect(backdrop).not.toBeNull();
    if (!backdrop) throw new Error('背景がありません');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: '閉じる' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('QrModal', () => {
  it('閉じた状態では表示せず、再度開ける', () => {
    const onClose = vi.fn();
    const { rerender } = render(<QrModal url={url} open={false} onClose={onClose} />);
    expect(screen.queryByText(url)).not.toBeInTheDocument();
    rerender(<QrModal url={url} open onClose={onClose} />);
    expect(screen.getByText(url)).toBeInTheDocument();
    rerender(<QrModal url={url} open={false} onClose={onClose} />);
    rerender(<QrModal url={url} open onClose={onClose} />);
    expect(screen.getByText(url)).toBeInTheDocument();
  });

  it('パネル内のクリックでは閉じず、閉じるボタンで一度だけ通知する', () => {
    const onClose = vi.fn();
    render(<QrModal url={url} open onClose={onClose} />);
    fireEvent.click(screen.getByText(url));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('背景クリックとパネル内のEscapeで閉じる', () => {
    const onClose = vi.fn();
    const { container } = render(<QrModal url={url} open onClose={onClose} />);
    const backdrop = container.firstElementChild;
    expect(backdrop).not.toBeNull();
    if (!backdrop) throw new Error('背景がありません');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: '閉じる' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
