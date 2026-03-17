// ルームURL ユーティリティ

/** ルームIDから共有用URLを生成する */
export function getRoomShareUrl(roomId: string): string {
  return `${window.location.origin}/#/${roomId}`;
}
