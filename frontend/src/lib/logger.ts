// 共通ロガーファクトリー

/** タグ付きロガーを生成する */
export function createLogger(tag: string) {
  const prefix = () => `[${tag} ${new Date().toISOString()}]`;

  const log = (...args: unknown[]): void => {
    if (import.meta.env.DEV) console.log(prefix(), ...args);
  };
  const warn = (...args: unknown[]): void => {
    console.warn(prefix(), ...args);
  };
  const error = (...args: unknown[]): void => {
    console.error(prefix(), ...args);
  };

  return { log, warn, error };
}
