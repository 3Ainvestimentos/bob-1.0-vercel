// src/app/admin/_lib/user.service.ts

import { getAuthenticatedFirestoreAdmin, getAuthenticatedAuthAdmin } from '@/lib/server/firebase';import { UserRole } from '@/types';
import { FieldValue } from 'firebase-admin/firestore'; // Importação correta para o Admin SDK

export async function getUsersWithRolesService(): Promise<any[]> {
    const authAdmin = await getAuthenticatedAuthAdmin();
    const adminDb = await getAuthenticatedFirestoreAdmin();
    const listUsersResult = await authAdmin.listUsers();
    
    const usersFromAuth = listUsersResult.users;
    if (usersFromAuth.length === 0) return [];

    const userDocRefs = usersFromAuth.map(user => adminDb.collection('users').doc(user.uid));
    const userDocsSnapshots = await adminDb.getAll(...userDocRefs);
    
    const usersWithRoles = userDocsSnapshots.map((userDoc, index) => {
        const user = usersFromAuth[index];
        const userData = userDoc.exists ? userDoc.data() : null;
        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: userData?.role || 'user',
            createdAt: (userData?.createdAt as import('firebase-admin/firestore').Timestamp)?.toDate().toISOString() || user.metadata.creationTime,
            hasCompletedOnboarding: userData?.hasCompletedOnboarding ?? false,
        };
    });

    return usersWithRoles;
}

export async function getPreRegisteredUsersService(): Promise<any[]> {
    const adminDb = await getAuthenticatedFirestoreAdmin();
    const preRegSnapshot = await adminDb.collection('pre_registered_users').get();
    
    if (preRegSnapshot.empty) return [];
    
    const preRegisteredUsers = preRegSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            email: doc.id,
            role: data.role,
            createdAt: (data.createdAt as import('firebase-admin/firestore').Timestamp)?.toDate().toISOString(),
        };
    });
    
    return preRegisteredUsers;
}

export async function preRegisterUserService(email: string, role: UserRole): Promise<{ success: true }> {
    if (!email || !role) {
        throw new Error('Email e Papel são obrigatórios.');
    }

    const adminDb = await getAuthenticatedFirestoreAdmin();
    const authAdmin = await getAuthenticatedAuthAdmin();

    try {
        await authAdmin.getUserByEmail(email);
        // Se não der erro, o usuário já existe no Auth
        throw new Error('Este e-mail já está em uso por outro usuário.');
    } catch (error: any) {
        // O erro 'auth/user-not-found' é o esperado. Qualquer outro erro deve ser lançado.
        if (error.code !== 'auth/user-not-found') {
            throw error;
        }
    }

    const preRegRef = adminDb.collection('pre_registered_users').doc(email.toLowerCase());
    const preRegDoc = await preRegRef.get();
    if (preRegDoc.exists) {
        throw new Error('Este e-mail já está pré-registrado.');
    }

    await preRegRef.set({
        role: role,
        createdAt: FieldValue.serverTimestamp(), // Sintaxe correta para o Admin SDK
    });

    return { success: true };
}


export async function setUserRoleService(userId: string, role: UserRole): Promise<{ success: true }> {
    if (!userId || !role) {
        throw new Error("UserID e Role são obrigatórios.");
    }

    const adminDb = await getAuthenticatedFirestoreAdmin();
    const userRef = adminDb.collection('users').doc(userId);
    
    await userRef.set({ role: role }, { merge: true });

    return { success: true };
}

export async function setUserOnboardingStatusService(userId: string, status: boolean): Promise<{ success: true }> {
    if (!userId) {
        throw new Error("UserID é obrigatório.");
    }
    
    const adminDb = await getAuthenticatedFirestoreAdmin();
    const userRef = adminDb.collection('users').doc(userId);
    
    await userRef.set({ hasCompletedOnboarding: status }, { merge: true });

    return { success: true };
}

export async function deleteUserService(userId: string): Promise<{ success: true }> {
    if (!userId) {
        throw new Error("UserID é obrigatório.");
    }

    const authAdmin = await getAuthenticatedAuthAdmin();
    const adminDb = await getAuthenticatedFirestoreAdmin();
    
    await authAdmin.deleteUser(userId);
    
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.delete();

    return { success: true };
}