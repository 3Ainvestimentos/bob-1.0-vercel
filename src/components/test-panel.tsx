'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { askChatbot } from '@/ai/flows/chatbot-flow';

export function TestPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<string>('Clique no botão para iniciar o teste.');

  const handleTest = async () => {
    setIsLoading(true);
    setTestResult('Testando conexão...');
    try {
      const response = await askChatbot({
        history: [],
        prompt: 'Olá, você está conectado e respondendo?',
      });
      setTestResult(`Sucesso! Resposta da IA: \n\n${response}`);
    } catch (error: any) {
      console.error('Test Error:', error);
      setTestResult(`Erro no teste: \n\n${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full lg:w-1/3 h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-center text-xl">Painel de Teste</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
                Use este painel para verificar a conexão com o Vertex AI e o corpus RAG.
            </p>
            <div className="p-4 bg-muted rounded-md min-h-[200px]">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                    {testResult}
                </pre>
            </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-6">
        <Button onClick={handleTest} disabled={isLoading} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testando...
            </>
          ) : (
            'Testar Conexão RAG'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
