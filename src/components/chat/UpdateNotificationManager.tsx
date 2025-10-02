// src/components/chat/UpdateNotificationManager.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UpdateNotesDialog } from './UpdateNotesDialog';
import { acknowledgeUpdate } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

// IMPORTANTE: Para futuras atualizações, basta mudar esta string.
const CURRENT_UPDATE_VERSION = 'update-2025-10-01-v1';

export function UpdateNotificationManager() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showUpdateNotes, setShowUpdateNotes] = useState(false);

  useEffect(() => {
    if (!user || authLoading) {
      return;
    }

    const checkVersion = async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.lastSeenUpdateVersion !== CURRENT_UPDATE_VERSION) {
            setShowUpdateNotes(true);
          }
        }
      } catch (err: any) {
        console.error("Erro ao verificar a versão da atualização:", err);
        toast({
          variant: 'destructive',
          title: 'Erro de Sincronização',
          description: 'Não foi possível verificar as últimas atualizações.',
        });
      }
    };

    checkVersion();
  }, [user, authLoading, toast]);

  const handleAcknowledgeUpdate = async () => {
    setShowUpdateNotes(false);
    if (user) {
      await acknowledgeUpdate(user.uid, CURRENT_UPDATE_VERSION);
    }
  };

  return (
    <UpdateNotesDialog
      open={showUpdateNotes}
      onAcknowledge={handleAcknowledgeUpdate}
    />
  );
}