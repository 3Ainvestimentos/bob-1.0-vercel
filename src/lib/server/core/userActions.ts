// src/lib/server/core/userActions.ts

'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { getAuthenticatedFirestoreAdmin } from '@/lib/server/firebase';

/**
 * Atualiza o perfil de um usuário para registrar que ele viu uma determinada versão das notas de atualização.
 * @param userId O ID do usuário.
 * @param versionId A string de identificação da versão que o usuário viu.
 * @returns Um objeto indicando o sucesso da operação.
 */
export async function acknowledgeUpdate(userId: string, versionId: string): Promise<{ success: boolean }> {
    if (!userId || !versionId) {
        console.error("User ID e Version ID são obrigatórios para confirmar a atualização.");
        return { success: false };
    }
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const userRef = adminDb.collection('users').doc(userId);
        
        // Salva a última versão da atualização vista pelo usuário no Firestore.
        await userRef.set({
            lastSeenUpdateVersion: versionId
        }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error(`Erro ao salvar a versão da atualização para o usuário ${userId}:`, error);
        return { success: false };
    }
}