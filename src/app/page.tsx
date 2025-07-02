'use client';

import { Button } from '@/components/ui/button';
import { LogIn, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { useEffect } from 'react';

const BotIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        className="mb-4 h-16 w-16 text-gray-400"
        fill="currentColor"
    >
        <path d="M208,32H48A16,16,0,0,0,32,48V160a16,16,0,0,0,16,16H72.36a31.84,31.84,0,0,1,16.48,5l24.43,18.32a15.93,15.93,0,0,0,19.46,0L157.15,181a31.84,31.84,0,0,1,16.48-5H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM96,128a12,12,0,1,1,12-12A12,12,0,0,1,96,128Zm64,0a12,12,0,1,1,12-12A12,12,0,0,1,160,128Z" />
    </svg>
);

export default function LoginPage() {
    const router = useRouter();
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading && user) {
            router.push('/chat');
        }
    }, [user, loading, router]);

    const handleGoogleSignIn = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            // O useEffect cuidará do redirecionamento
        } catch (error) {
            console.error("Erro ao fazer login com o Google:", error);
            // Opcional: mostrar um toast de erro para o usuário
        }
    };
    
    if (loading || user) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
                <p>Carregando...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground">
            <main className="flex flex-1 flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center text-center">
                    <BotIcon />
                    <h1 className="text-4xl font-bold tracking-tight">Bem-vindo ao Bob</h1>
                    <p className="mt-2 text-lg text-muted-foreground">Assistente de IA Generativa da 3A RIVA</p>
                    <div className="mt-8 flex flex-col gap-4">
                         <Button onClick={handleGoogleSignIn}>
                            <LogIn className="mr-2 h-4 w-4" />
                            Entrar com conta 3A RIVA
                        </Button>
                        <Button variant="outline" onClick={() => router.push('/chat')}>
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Testar o chat sem login
                        </Button>
                    </div>
                </div>
            </main>
            <footer className="w-full p-6 text-center text-xs text-muted-foreground">
                <p>Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo pode cometer erros. Por isso, é bom checar as respostas.</p>
                <p className="mt-1">© 2025 Bob 1.0. Todos os direitos reservados.</p>
            </footer>
        </div>
    );
}
