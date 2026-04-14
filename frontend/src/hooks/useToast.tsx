import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ShowToast = (message: string, isError?: boolean) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export interface ToastState {
  message: string;
  isError: boolean;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback<ShowToast>((message, isError = false) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToast({ message, isError });
    timerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return (
    <ToastContext value={showToast}>
      {children}
      {toast && <ToastDisplay message={toast.message} isError={toast.isError} />}
    </ToastContext>
  );
}

function ToastDisplay({ message, isError }: ToastState) {
  return (
    <div
      className={[
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg',
        'animate-slide-up pointer-events-none',
        isError ? 'bg-red-600' : 'bg-blue-600',
      ].join(' ')}
    >
      {message}
    </div>
  );
}
