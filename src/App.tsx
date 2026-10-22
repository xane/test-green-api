import { useState } from 'react';
import type { GreenApi } from './api';
import { Login } from './Login';
import { ChatProvider } from './ChatProvider';
import { Chat } from './Chat';

export function App() {
  const [api, setApi] = useState<GreenApi | null>(null);
  return api ? (
    <ChatProvider api={api}>
      <Chat instanceId={api.credentials.idInstance} onLogout={() => setApi(null)} />
    </ChatProvider>
  ) : (
    <Login onConnect={setApi} />
  );
}
