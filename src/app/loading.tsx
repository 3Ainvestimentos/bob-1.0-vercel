
'use client';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[200] flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-4">
            <p className="animate-pulse-slow text-lg text-muted-foreground">
                Carregando Bob 1.0...
            </p>
        </div>
    </div>
  );
}
