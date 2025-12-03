'use client';

import { auth } from '@/lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

// ✨ NOVO: Helper para cache simples
const AUTH_CACHE_KEY = 'firebase_auth_hint';

/**
 * Salva uma "dica" se o usuário estava autenticado
 * Isso é apenas para UX, não para segurança
 */
const saveAuthHint = (isAuthenticated: boolean) => {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, isAuthenticated ? '1' : '0');
  } catch {
    // Ignora erros silenciosamente
  }
};

/**
 * Carrega a "dica" de autenticação
 * Retorna true se havia usuário na última sessão
 */
const loadAuthHint = (): boolean => {
  try {
    return localStorage.getItem(AUTH_CACHE_KEY) === '1';
  } catch {
    return false;
  }
};

export default function AuthProvider({ children }: { children: ReactNode }) {
  // ✨ NOVO: Inicializar loading baseado no cache
  // Se havia usuário antes, já começamos com loading: false
  const hadUser = typeof window !== 'undefined' ? loadAuthHint() : false;
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!hadUser); // 🎯 Mudança chave aqui

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      
      // ✨ NOVO: Salvar hint para próxima vez
      saveAuthHint(user !== null);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}