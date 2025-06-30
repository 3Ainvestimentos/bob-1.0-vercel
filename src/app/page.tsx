'use client';

import React, { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

function GradioEmbed() {
  const gradioUrl = `https://genai-app-locatingandassessingola-1-1751046095728-629342546806.us-central1.run.app/?key=${process.env.NEXT_PUBLIC_GRADIO_API_KEY}`;

  if (!process.env.NEXT_PUBLIC_GRADIO_API_KEY || process.env.NEXT_PUBLIC_GRADIO_API_KEY.includes('YOUR_SECRET_KEY')) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Card className="w-full max-w-xl border-destructive">
            <CardHeader>
                <CardTitle className="text-center text-2xl text-destructive">Erro de Configuração do Gradio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
                <p className="text-muted-foreground">
                    A chave da API para a aplicação Gradio não foi encontrada.
                </p>
                <div className="text-left">
                    <p className="font-semibold">Por favor, verifique os seguintes passos:</p>
                    <ul className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                        <li>Abra o arquivo <code>.env</code> na raiz do seu projeto.</li>
                        <li>Certifique-se de que a variável <code>NEXT_PUBLIC_GRADIO_API_KEY</code> está definida com a chave correta.</li>
                        <li>Após salvar as alterações, **reinicie o servidor de desenvolvimento**.</li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    </div>
    )
  }

  return (
      <iframe
        src={gradioUrl}
        frameBorder="0"
        className="h-full w-full rounded-lg border"
        title="Gradio App"
      ></iframe>
  );
}

// --- Main Page Component ---
export default function HomePage() {
    const { user, signIn } = useAuth();
  
    if (!user) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-background">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>Acesso Restrito</CardTitle>
                    <CardDescription>Você precisa estar autenticado para acessar a aplicação.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={signIn}>
                        <LogIn className="mr-2 h-4 w-4" />
                        Entrar com Google
                    </Button>
                </CardContent>
            </Card>
        </div>
      );
    }
  
    return (
      <div className="h-screen p-4">
        <Suspense fallback={
          <div className="flex h-full w-full items-center justify-center">
            <Card className="flex h-full w-full flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Carregando aplicação...</p>
            </Card>
          </div>
        }>
            <GradioEmbed />
        </Suspense>
      </div>
    );
}
