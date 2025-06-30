'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import type { User } from 'firebase/auth';

// This is a mock AuthProvider to prevent the app from crashing due to missing
// Firebase client-side configuration. It provides a fake user so the UI
// renders correctly. To enable real Firebase Authentication, you need to add
// your NEXT_PUBLIC_FIREBASE_* variables to the .env file.

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A mock user object that satisfies the 'User' type from 'firebase/auth'.
// We cast to 'any' then 'User' to bypass strict type checking for the mock.
const mockUser = {
  uid: 'mock-user-123',
  email: 'user@example.com',
  displayName: 'Test User',
  photoURL: null,
} as any as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = {
    user: mockUser,
    loading: false,
    signIn: async () => { console.warn("Firebase Auth not configured. Sign-in is disabled.") },
    signOut: async () => { console.warn("Firebase Auth not configured. Sign-out is disabled.") },
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
