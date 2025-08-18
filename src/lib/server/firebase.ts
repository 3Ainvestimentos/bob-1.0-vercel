/**
 * @fileoverview Centraliza a inicialização e o acesso ao Firebase Admin SDK.
 * Este módulo garante que o SDK seja inicializado apenas uma vez (padrão singleton)
 * e fornece funções auxiliarias para acessar os serviços do Firebase, como
 * Firestore e Auth, de forma autenticada no lado do servidor.
 */

'use server';

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore as getFirestoreAdmin } from 'firebase-admin/firestore';
import { getAuth as getAuthAdmin } from 'firebase-admin/auth';

let adminApp: App | null = null;

function getServiceAccountCredentialsFromEnv() {
    const serviceAccountKeyBase64 = process.env.SERVICE_ACCOUNT_KEY_INTERNAL;

    if (!serviceAccountKeyBase64) {
        throw new Error('A variável de ambiente SERVICE_ACCOUNT_KEY_INTERNAL não está definida ou está vazia.');
    }

    try {
        const decodedKey = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf-8');
        return JSON.parse(decodedKey);
    } catch (error: any) {
        console.error("Falha ao decodificar ou analisar a chave da conta de serviço.", error.message);
        throw new Error(`Falha ao processar a chave da conta de serviço: ${'' + error.message}`);
    }
}

function initializeFirebaseAdminApp() {
    if (adminApp) {
        return adminApp;
    }

    const appName = 'firebase-admin-app-singleton';
    const existingApp = getApps().find(app => app.name === appName);
    if (existingApp) {
        adminApp = existingApp;
        return adminApp;
    }
    
    try {
        const serviceAccount = getServiceAccountCredentialsFromEnv();
        adminApp = initializeApp({
            credential: cert(serviceAccount)
        }, appName);
    } catch (error: any) {
        console.error("Falha ao inicializar o Admin SDK do Firebase com as credenciais da conta de serviço:", error.message);
        throw new Error("Não foi possível inicializar os serviços de backend. Verifique a configuração da conta de serviço.");
    }

    return adminApp;
}


export async function getAuthenticatedFirestoreAdmin() {
    const app = initializeFirebaseAdminApp();
    return getFirestoreAdmin(app);
}

export async function getAuthenticatedAuthAdmin() {
    const app = initializeFirebaseAdminApp();
    return getAuthAdmin(app);
}

    