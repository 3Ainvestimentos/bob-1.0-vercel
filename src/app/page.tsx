'use client';

import { Button } from '@/components/ui/button';
import { Settings, TestTube2 } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const GoogleIcon = () => (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20c0-1.341-.138-2.65-.389-3.917z" />
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.657-3.298-11.48-7.961l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.902,35.696,44,30.41,44,24C44,22.659,43.862,21.34,43.611,20.083z" />
    </svg>
);

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
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'authenticated') {
            router.push('/chat');
        }
    }, [status, router]);

    if (status === 'loading' || status === 'authenticated') {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
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
                        <Button
                            variant="outline"
                            onClick={() => signIn('google', { callbackUrl: '/chat' })}
                        >
                            <GoogleIcon />
                            Entrar com conta 3A RIVA
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => router.push('/chat')}
                        >
                            <TestTube2 />
                            Testar o chat sem login
                        </Button>
                    </div>
                </div>
            </main>
            <footer className="w-full p-6 text-center text-xs text-muted-foreground">
                <p>Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo pode cometer erros. Por isso, é bom checar as respostas.</p>
                <p className="mt-1">© 2025 Bob 1.0. Todos os direitos reservados.</p>
            </footer>
            <div className="absolute bottom-4 left-4">
                <Button variant="ghost" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    Configurações
                </Button>
            </div>
        </div>
    );
}
