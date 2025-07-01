'use client';

import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, LogIn, Bot, AlertTriangle } from 'lucide-react';
import Script from 'next/script';

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gen-search-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        configId: string;
        triggerId: string;
      };
    }
  }
}

// The new component that renders the Google Search Widget
function SearchWidget() {
  return (
    <>
      {/* Load the widget's JavaScript bundle */}
      <Script src="https://cloud.google.com/ai/gen-app-builder/client?hl=pt_BR" strategy="afterInteractive" />
      
      {/* The widget element, hidden by default */}
      <gen-search-widget
        configId="05715c26-4df8-4676-84b9-475cec8e1191"
        triggerId="searchWidgetTrigger"
      >
      </gen-search-widget>

      {/* The trigger element that opens the widget */}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="flex w-full max-w-lg flex-col items-center text-center">
            <Bot className="mb-4 h-16 w-16 text-primary" />
            <h2 className="text-2xl font-bold">Assistente de Pesquisa</h2>
            <p className="mb-6 text-muted-foreground">
              Use a barra de pesquisa abaixo para interagir com o assistente.
            </p>
            <Input
                id="searchWidgetTrigger"
                placeholder="Pesquise aqui"
                className="w-full"
            />
        </div>
      </div>
    </>
  );
}

export default function SearchPage() {
  const { user, loading, signIn, isFirebaseConfigured } = useAuth();

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center gap-6 p-4">
         <div className="text-center">
            <h1 className="text-3xl font-bold">Bem-vindo ao DataVisor</h1>
            <p className="mt-2 text-muted-foreground">Faça login para usar o assistente de pesquisa.</p>
        </div>
        <Button size="lg" onClick={signIn}>
            <LogIn className="mr-2" />
            Entrar com Google
        </Button>
         {!isFirebaseConfigured && (
          <div className="mt-4 flex max-w-md items-center gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="h-6 w-6 flex-shrink-0" />
            <div className="text-left">
                <p className="font-bold">Ação Necessária</p>
                <p className="text-sm">A configuração do Firebase está incompleta. Por favor, preencha o arquivo <code>.env</code> e reinicie o servidor para habilitar o login.</p>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Render the widget in a flex container to keep it centered
  return (
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col">
          <SearchWidget />
      </div>
  );
}
