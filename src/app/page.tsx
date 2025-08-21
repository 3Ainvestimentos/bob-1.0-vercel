
'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { auth, db, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { BobIcon } from '@/components/icons/BobIcon';
import { getMaintenanceMode, validateAndOnboardUser } from './actions';
import { doc, getDoc } from 'firebase/firestore';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { Wrench } from 'lucide-react';


export default function LoginPage() {
    const router = useRouter();
    const { user, loading } = useAuth();
    const { toast } = useToast();
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(true);
    const [isCheckingMaintenance, setIsCheckingMaintenance] = useState(true);

    useEffect(() => {
        const checkMaintenance = async () => {
            try {
                const maintenanceStatus = await getMaintenanceMode();
                setIsMaintenanceMode(maintenanceStatus.isMaintenanceMode);
            } catch (error) {
                console.error("Failed to check maintenance mode:", error);
                setIsMaintenanceMode(false);
            } finally {
                setIsCheckingMaintenance(false);
            }
        };
        checkMaintenance();
    }, []);

    useEffect(() => {
        if (loading || isCheckingMaintenance) {
            return;
        }

        if (user && user.email) {
            const handleUserLogin = async () => {
                try {
                    const validationResult = await validateAndOnboardUser(user.uid, user.email, user.displayName);

                    if (!validationResult.success || !validationResult.role) {
                        toast({
                            variant: 'destructive',
                            title: 'Acesso Negado',
                            description: validationResult.error || 'Você não tem permissão para acessar o sistema.',
                        });
                        await signOut(auth);
                        return;
                    }
                    
                    if (isMaintenanceMode && validationResult.role !== 'admin' && validationResult.role !== 'beta') {
                        toast({
                            variant: 'destructive',
                            title: 'Acesso Negado',
                            description: 'O sistema está em manutenção. Apenas usuários beta e administradores podem acessar.',
                        });
                        await signOut(auth);
                        return;
                    }

                    // If all checks pass, redirect to chat
                    router.push('/chat');

                } catch (err: any) {
                    toast({
                        variant: 'destructive',
                        title: 'Erro de Autenticação',
                        description: `Ocorreu um erro inesperado: ${err.message}`,
                    });
                    await signOut(auth);
                }
            };
            handleUserLogin();
        }
    }, [user, loading, router, toast, isMaintenanceMode, isCheckingMaintenance]);

    const handleGoogleSignIn = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            const errorCode = (error as any).code;
            if (errorCode !== 'auth/popup-closed-by-user' && errorCode !== 'auth/cancelled-popup-request') {
                console.error("Erro ao fazer login com o Google:", error);
                toast({
                    variant: "destructive",
                    title: "Erro de Login",
                    description: "Ocorreu um erro ao tentar fazer login. Tente novamente.",
                });
            }
        }
    };
    
    if (loading || isCheckingMaintenance) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
                <p>Carregando Bob 1.0...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground">
            <main className="flex flex-1 flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center text-center">
                    <BobIcon className="mb-4 h-16 w-16" />
                    <h1 className="text-4xl font-bold tracking-tight">Bem-vindo ao Bob</h1>
                    
                    {isMaintenanceMode ? (
                        <div className="mt-6 w-full max-w-sm rounded-xl border border-orange-200 bg-orange-50 p-6 text-center text-orange-700">
                           <div className="flex justify-center">
                             <Wrench className="h-8 w-8 text-orange-600" />
                           </div>
                           <h2 className="mt-4 text-lg font-semibold text-orange-800">Plataforma em Manutenção</h2>
                           <p className="mt-1 text-sm">
                             A plataforma está temporariamente indisponível para manutenção. Voltaremos em breve!
                           </p>
                        </div>
                    ) : (
                         <p className="mt-2 text-lg text-muted-foreground">Assistente de IA Generativa da 3A RIVA</p>
                    )}

                    <div className="mt-8 w-full max-w-sm">
                         <Button onClick={handleGoogleSignIn} variant="outline" className="w-full text-muted-foreground">
                            <GoogleIcon className="mr-2 h-4 w-4" />
                            Entrar com Google
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
