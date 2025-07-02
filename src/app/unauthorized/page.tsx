'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

export default function UnauthorizedPage() {
    const router = useRouter();

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
            <div className="flex flex-col items-center text-center max-w-md p-6">
                <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
                <h1 className="text-4xl font-bold tracking-tight">Acesso Negado</h1>
                <p className="mt-4 text-lg text-muted-foreground">
                    Você não tem permissão para acessar esta aplicação. Por favor, use uma conta do Google associada ao domínio da 3A RIVA.
                </p>
                <Button
                    onClick={() => router.push('/')}
                    className="mt-8"
                >
                    Voltar para a Página de Login
                </Button>
            </div>
        </div>
    );
}
