// src/app/admin/_lib/system.service.ts

import { getAuthenticatedFirestoreAdmin, getAuthenticatedAuthAdmin} from '@/lib/server/firebase';

// IMPORTANTE: Garanta que estas funções estejam acessíveis a partir deste arquivo.
// Você pode precisar movê-las para um diretório 'lib' compartilhado.
import { deidentifyQuery } from '../../actions'; 
import { callDiscoveryEngine } from '../../actions';
import { callGemini } from '../../actions';
import { GeminiResponse } from '@/types'; 

export async function getMaintenanceModeService(): Promise<{ isMaintenanceMode: boolean }> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const settingsRef = adminDb.collection('system_settings').doc('config');
        const docSnap = await settingsRef.get();

        if (docSnap.exists) {
            const data = docSnap.data();
            
            // Verificar se está na Vercel (usando variável automática ou compartilhada)
            const isVercel = process.env.VERCEL === '1' || process.env.IS_VERCEL_MODE === 'true' || process.env.IS_VERCEL === 'true';
            
            // Se estiver na Vercel, ler isMaintenanceModeVercel, senão ler o original
            if (isVercel) {
                return { isMaintenanceMode: data?.isMaintenanceModeVercel ?? false };
            } else {
                return { isMaintenanceMode: data?.isMaintenanceMode ?? false };
            }
        }
        return { isMaintenanceMode: false }; // Valor padrão
    } catch (error: any) {
        console.error("Error getting maintenance mode in service:", error);
        // Lança o erro para a action capturar
        throw new Error(error.message);
    }
}

export async function setMaintenanceModeService(isMaintenanceMode: boolean): Promise<{ success: true }> {
    try {
        const adminDb = await getAuthenticatedFirestoreAdmin();
        const settingsRef = adminDb.collection('system_settings').doc('config');
        await settingsRef.set({ isMaintenanceMode }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting maintenance mode in service:", error);
        // Lança o erro para a action capturar
        throw new Error(error.message);
    }
}

export async function runApiHealthCheckService(): Promise<{ results: any[] }> {
    const results = [];
    
    // Teste 1: Google Cloud DLP API
    let dlpStartTime = Date.now();
    try {
        await deidentifyQuery("health check test");
        results.push({
            api: 'Google Cloud DLP',
            status: 'OK',
            latency: Date.now() - dlpStartTime,
        });
    } catch (e: any) {
        results.push({
            api: 'Google Cloud DLP',
            status: 'Erro',
            latency: Date.now() - dlpStartTime,
            error: e.message,
        });
    }

    // Teste 2: Vertex AI Search (RAG)
    let ragStartTime = Date.now();
    try {
        await callDiscoveryEngine("teste", []);
        results.push({
            api: 'Vertex AI Search (RAG)',
            status: 'OK',
            latency: Date.now() - ragStartTime,
        });
    } catch (e: any) {
        results.push({
            api: 'Vertex AI Search (RAG)',
            status: 'Erro',
            latency: Date.now() - ragStartTime,
            error: e.message,
        });
    }
    
    // Teste 3: Google Gemini API (Web Search)
    // Teste 3: Google Gemini API (Web Search)
    let geminiStartTime = Date.now();
    try {
        // Agora 'res' tem um tipo conhecido
        const res: GeminiResponse = await callGemini("teste", [], null, true);

        // O TypeScript agora entende 'res.error' e o erro desaparece
        if (res.error) {
            throw new Error(res.error);
        }

        results.push({
            api: 'Google Gemini API',
            status: 'OK',
            latency: Date.now() - geminiStartTime,
        });
    } catch (e: any) {
        results.push({
            api: 'Google Gemini API',
            status: 'Erro',
            latency: Date.now() - geminiStartTime,
            error: e.message,
        });
    }
    return { results };
}
