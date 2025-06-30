'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { testRagConnection } from '@/ai/flows/test-rag-flow';

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestClick = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      const result = await testRagConnection();
      setTestResult(`Sucesso: A IA respondeu:\n\n${result}`);
    } catch (error: any) {
      console.error('Erro no teste de conexão RAG:', error);
      setTestResult(`Falha na Conexão:\n\n${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Teste de Conexão RAG</CardTitle>
          <CardDescription>
            Este botão executa uma única chamada à API do Gemini, tentando usar o corpus RAG configurado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={handleTestClick} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isLoading ? 'Testando...' : 'Testar Conexão com o Vertex/Corpus'}
          </Button>
          {testResult && (
            <div className="mt-4 rounded-md border bg-muted p-4">
              <h3 className="font-semibold">Resultado do Teste:</h3>
              <pre className="mt-2 whitespace-pre-wrap break-all text-sm text-muted-foreground">
                {testResult}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
