'use client';

import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, LogIn, Bot, AlertTriangle, Search } from 'lucide-react';
import Script from 'next/script';

// Declare the custom element for TypeScript for inline search
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gen-search-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        configId: string;
        triggerId?: string;
        'search-box-id'?: string;
        'results-container-id'?: string;
      };
    }
  }
}

// A new component for the inline search experience
function InlineSearchWidget() {
  return (
    <div className="flex h-full w-full flex-col p-4 md:p-6">
      {/* Load the widget's JavaScript bundle */}
      <Script src="https://cloud.google.com/ai/gen-app-builder/client?hl=pt_BR" strategy="afterInteractive" />

      {/* The widget element is not visible, it just orchestrates */}
      <gen-search-widget
        configId="05715c26-4df8-4676-84b9-475cec8e1191"
        search-box-id="searchBox"
        results-container-id="resultsContainer"
      />

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center gap-4 border-b">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <CardTitle>Assistente de Pesquisa</CardTitle>
            <CardDescription>
              Faça sua pergunta e veja os resultados abaixo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input id="searchBox" placeholder="Quem é Gabriela Rocha?" className="pl-10" />
          </div>
          <div id="resultsContainer" className="flex-1 overflow-auto rounded-lg border">
             <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                <p>Os resultados da sua pesquisa aparecerão aqui.</p>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
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
  
  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <InlineSearchWidget />
    </div>
  );
}
