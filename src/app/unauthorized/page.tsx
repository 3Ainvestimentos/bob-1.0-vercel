import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center p-4">
        <h1 className="text-4xl font-bold">Acesso Negado</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Você não tem permissão para acessar esta aplicação.
        </p>
        <p className="mt-2 text-muted-foreground">
          O login é restrito a usuários com um e-mail verificado do domínio @3ainvestimentos.com.br.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Tentar novamente</Link>
        </Button>
      </div>
    </div>
  );
}
