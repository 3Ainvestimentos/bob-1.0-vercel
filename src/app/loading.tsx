'use client';

import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
      <Loader2
        className="h-12 w-12 animate-spin"
        style={{ color: 'hsl(170, 60%, 50%)' }}
      />
      <p className="text-lg text-muted-foreground">
        Carregando Bob...
      </p>
    </div>
  );
}
