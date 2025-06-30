'use client';

import Script from 'next/script';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Bot } from 'lucide-react';

export default function SearchPage() {
  return (
    <>
      <Script
        src="https://cloud.google.com/ai/gen-app-builder/client?hl=pt_BR"
        strategy="afterInteractive"
      />
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center gap-4 p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="flex flex-col items-center gap-2">
              <Bot className="h-12 w-12 text-primary" />
              <CardTitle className="text-center text-2xl">Vertex AI Search</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-center text-muted-foreground">
              Digite sua pesquisa abaixo para interagir com a busca inteligente.
            </p>
            <Input
              placeholder="Pesquise aqui"
              id="searchWidgetTrigger"
              className="text-base"
            />
            {/* The widget element. In JSX, custom elements must be lowercase. */}
            <gen-search-widget
              config-id="05715c26-4df8-4676-84b9-475cec8e1191"
              trigger-id="searchWidgetTrigger"
            ></gen-search-widget>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
