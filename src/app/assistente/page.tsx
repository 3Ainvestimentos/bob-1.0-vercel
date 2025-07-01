'use client';

import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Bot, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Script from 'next/script';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gen-search-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        configId: string;
        resultsContainerId?: string;
        inputTriggerId?: string;
      };
    }
  }
}

export default function AssistentePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* Load the widget's JavaScript bundle and define the widget. */}
      <Script src="https://cloud.google.com/ai/gen-app-builder/client?hl=pt_BR" strategy="afterInteractive" />
      <gen-search-widget
        configId="05715c26-4df8-4676-84b9-475cec8e1191"
        inputTriggerId="searchInlineTrigger"
        resultsContainerId="results-container"
      />
      
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
              {/* This input will trigger the inline search */}
              <Input id="searchInlineTrigger" placeholder="Pesquise aqui" className="w-full pl-10" />
            </div>
          </CardHeader>
          <CardContent id="results-container" className="flex-1 overflow-auto p-4 md:p-6">
            {/* The widget will populate this area with results */}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
