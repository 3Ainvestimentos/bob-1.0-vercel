
'use client';

import dynamic from 'next/dynamic';

const ChatPage = dynamic(() => import('./ChatPage'), {
  ssr: false,
  loading: () => <div className="flex h-screen w-full items-center justify-center bg-background"><p className="text-lg text-muted-foreground">Carregando Bob 1.0...</p></div>,
});

export default function Page() {
  return <ChatPage />;
}
