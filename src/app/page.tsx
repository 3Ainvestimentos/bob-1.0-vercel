

'use client';

import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { auth, db, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { BobIcon } from '@/components/icons/BobIcon';
import { getMaintenanceMode } from './actions';
import { doc, getDoc } from 'firebase/firestore';


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

        if (user) {
            const checkUserRoleAndRedirect = async () => {
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (!userDocSnap.exists()) {
                         throw new Error("Seu perfil de usuário não foi encontrado. Entre em contato com o suporte.");
                    }
                    
                    const userRole = userDocSnap.data()?.role || 'user';
                    
                    if (userRole === 'admin') {
                        router.push('/chat');
                        return;
                    }

                    if (isMaintenanceMode) {
                        if (userRole === 'beta') {
                            router.push('/chat');
                        } else {
                            await signOut(auth);
                            toast({
                                variant: 'destructive',
                                title: 'Acesso Negado',
                                description: 'O sistema está em manutenção. Apenas usuários beta e administradores podem acessar.',
                            });
                        }
                    } else {
                        // All roles can access if not in maintenance mode
                        router.push('/chat');
                    }

                } catch (err: any) {
                    await signOut(auth);
                    toast({
                        variant: 'destructive',
                        title: 'Erro de Autenticação',
                        description: err.message,
                    });
                }
            };
            checkUserRoleAndRedirect();
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
                        <p className="mt-2 text-lg text-destructive">O sistema está em manutenção e retorna em breve.</p>
                    ) : (
                         <p className="mt-2 text-lg text-muted-foreground">Assistente de IA Generativa da 3A RIVA</p>
                    )}

                    <div className="mt-8 flex flex-col gap-4">
                         <Button onClick={handleGoogleSignIn}>
                            <LogIn className="mr-2 h-4 w-4" />
                            {isMaintenanceMode ? 'Entrar como admin ou beta' : 'Entrar com conta 3A RIVA'}
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
