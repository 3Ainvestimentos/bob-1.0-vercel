'use client';

import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, LogIn, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { user, loading, signIn, isFirebaseConfigured } = useAuth();

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center p-4">
      {loading && <Loader2 className="h-8 w-8 animate-spin text-primary" />}

      {!loading && !user && (
        <div className="flex flex-col items-center justify-center gap-6 text-center">
          <h1 className="text-3xl font-bold">Bem-vindo ao DataVisor</h1>
          <p className="text-muted-foreground">Faça login para acessar o painel e o assistente de pesquisa.</p>
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
        <div className="flex flex-col items-center gap-6 text-center">
            <h1 className="text-3xl font-bold">Bem-vindo, {user.displayName?.split(' ')[0]}!</h1>
            <p className="text-muted-foreground">O que você gostaria de fazer hoje?</p>
            <Card className="w-full max-w-sm text-left transition-all hover:border-primary/80 hover:shadow-lg">
              <Link href="/assistente" className="block p-6">
                <CardHeader className="p-0">
                  <CardTitle className="flex items-center justify-between">
                    <span>Assistente de Pesquisa</span>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription className="pt-2">
                    Faça perguntas e obtenha respostas da nossa base de conhecimento.
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
        </div>
      )}
    </div>
  );
}
