import { useState, useEffect } from 'react';
import RoomCreate from './components/RoomCreate';
import RoomView from './components/RoomView';

function getRoomIdFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/(.+)$/);
  return match ? match[1] : null;
}

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(getRoomIdFromHash());

  useEffect(() => {
    const onHashChange = () => setRoomId(getRoomIdFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">WebRTC File Exporter</h1>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        {roomId ? <RoomView roomId={roomId} /> : <RoomCreate />}
      </main>
    </div>
  );
}
