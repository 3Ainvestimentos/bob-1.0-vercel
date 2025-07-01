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
        'search-box-id'?: string;
        'results-container-id'?: string;
      };
    }
  }
}

export default function SearchPage() {
  const { user, loading, signIn, isFirebaseConfigured } = useAuth();

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      {/* Load the widget's JavaScript bundle and define the widget.
          These are always rendered to ensure the widget initializes correctly. */}
      <Script src="https://cloud.google.com/ai/gen-app-builder/client?hl=pt_BR" strategy="afterInteractive" />
      <gen-search-widget
        configId="05715c26-4df8-4676-84b9-475cec8e1191"
        search-box-id="searchBox"
        results-container-id="resultsContainer"
      />

      {loading && (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && !user && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-4">
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
      )}

      {!loading && user && (
        <div className="flex h-full w-full flex-col p-4 md:p-6">
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="border-b">
              <div className="flex items-start gap-4">
                <Bot className="h-8 w-8 flex-shrink-0 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-xl">Assistente de Pesquisa</CardTitle>
                  <CardDescription>
                    Faça sua pergunta no campo abaixo para pesquisar na nossa base de conhecimento.
                  </CardDescription>
                </div>
              </div>
              <div className="relative pt-4">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                {/* The Input that the widget will control */}
                <Input id="searchBox" placeholder="Quem é Gabriela Rocha?" className="w-full pl-10" />
              </div>
            </CardHeader>
            {/* The container where the widget will inject results */}
            <CardContent id="resultsContainer" className="flex-1 overflow-auto p-4 md:p-6">
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <Bot className="mb-2 h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium text-muted-foreground">Os resultados da pesquisa aparecerão aqui.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
