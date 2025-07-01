'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { app, isFirebaseConfigured } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const auth = app ? getAuth(app) : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    if (!auth) {
      toast({
        variant: "destructive",
        title: "Firebase não configurado",
        description: "Por favor, adicione suas credenciais do Firebase ao arquivo .env para habilitar a autenticação.",
      });
      return;
    }
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Authentication Error:", error);
      toast({
        variant: "destructive",
        title: "Erro de Autenticação",
        description: error.message || "Não foi possível fazer o login. Tente novamente.",
      });
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error: any) {
       console.error("Sign Out Error:", error);
       toast({
        variant: "destructive",
        title: "Erro ao Sair",
        description: "Não foi possível fazer o logout.",
      });
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signOut: signOutUser,
    isFirebaseConfigured,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
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
