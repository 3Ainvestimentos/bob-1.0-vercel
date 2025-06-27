'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, type User, type Auth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const provider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      // Perform a check to give a more user-friendly error message.
      if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('YOUR_')) {
        throw new Error("Firebase API Key is missing or is a placeholder. Please check your .env file.");
      }
      const authInstance = getAuth(app);
      setAuth(authInstance);

      const unsubscribe = onAuthStateChanged(authInstance, (user) => {
        setUser(user);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error: any) {
      console.error("Firebase Auth Initialization Error:", error);
      setInitializationError(error);
      setLoading(false);
    }
  }, []); // Empty dependency array ensures this runs once on mount.

  const signIn = async () => {
    if (!auth) return;
    setLoading(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      setLoading(false); // Ensure loading is turned off on error
    }
    // onAuthStateChanged will handle setting the user and final loading state
  };

  const signOutUser = async () => {
    if (!auth) return;
    setLoading(true);
    try {
      await signOut(auth);
    } catch (error) {
        console.error("Error signing out", error);
        setLoading(false); // Ensure loading is turned off on error
    }
    // onAuthStateChanged will handle setting the user and final loading state
  };

  if (initializationError) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background p-4">
            <Card className="w-full max-w-xl border-destructive">
                <CardHeader>
                    <CardTitle className="text-center text-2xl text-destructive">Erro de Configuração do Firebase</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                    <p className="text-muted-foreground">
                        A aplicação não conseguiu se conectar ao Firebase. Isso geralmente acontece quando as chaves de configuração do ambiente não estão definidas corretamente.
                    </p>
                    <div className="text-left">
                        <p className="font-semibold">Por favor, verifique os seguintes passos:</p>
                        <ul className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                            <li>Abra o arquivo <code>.env</code> na raiz do seu projeto.</li>
                            <li>Certifique-se de que todas as variáveis <code>NEXT_PUBLIC_FIREBASE_*</code> estão preenchidas com os valores do seu projeto no <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Console do Firebase</a>.</li>
                            <li>Após salvar as alterações no arquivo <code>.env</code>, **reinicie o servidor de desenvolvimento** para que as novas variáveis sejam carregadas.</li>
                        </ul>
                    </div>
                     <div className="mt-6 rounded-md bg-muted p-3 text-left">
                        <p className="text-sm font-semibold text-muted-foreground">Detalhe do Erro:</p>
                        <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-destructive">
                           {initializationError.message}
                        </pre>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }
  
  const value = {
    user,
    loading,
    signIn,
    signOut: signOutUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex h-screen w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
