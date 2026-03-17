import type { ConnectionState } from '../types';

interface Props {
  wsState: ConnectionState;
  rtcState: ConnectionState;
}

const stateLabel: Record<ConnectionState, string> = {
  disconnected: '未接続',
  connecting: '接続中',
  connected: '接続済み',
  failed: 'エラー',
};

const stateColor: Record<ConnectionState, string> = {
  disconnected: 'bg-gray-500',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  failed: 'bg-red-500',
};

function Indicator({ label, state }: { label: string; state: ConnectionState }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${stateColor[state]}`} />
      <span className="text-gray-400">{label}:</span>
      <span>{stateLabel[state]}</span>
    </div>
  );
}

export default function ConnectionStatus({ wsState, rtcState }: Props) {
  return (
    <div className="flex gap-6 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <Indicator label="シグナリング" state={wsState} />
      <Indicator label="P2P" state={rtcState} />
    </div>
  );
}
