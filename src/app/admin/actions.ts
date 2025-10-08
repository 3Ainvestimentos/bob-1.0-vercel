// src/app/admin/actions.ts
// (Note: O padrão comum é 'actions.ts', no plural)

'use server';

import { UserRole } from '@/types';
import { calculateAdminMetrics, getAdminCostsFromService } from './lib/metrics_service';
import { getUsersWithRolesService, getPreRegisteredUsersService, preRegisterUserService, setUserRoleService, setUserOnboardingStatusService, deleteUserService,} from './lib/user_service';
import { getMaintenanceModeService, setMaintenanceModeService, runApiHealthCheckService,} from './lib/system_service';
import { getLegalIssueAlertsService, getFeedbacksService} from './lib/content_service';


// Esta é a única função que o seu front-end (page.tsx) irá importar.
// Ela atua como uma ponte segura para a sua lógica de serviço.

// --- Métricas de performance ---
export async function getAdminInsights(roleFilter: UserRole | 'all' = 'all') {
    try {
        // 1. (Opcional) Adicione verificações de segurança/permissão aqui
        // const user = await getCurrentUser(); if (user.role !== 'admin') throw new Error("Acesso negado");

        // 2. Chama a lógica principal e repassa os argumentos
        const insights = await calculateAdminMetrics(roleFilter);

        // 3. Retorna os dados com sucesso
        return insights;
        
    } catch (error: any) {
        console.error("Erro na Server Action getAdminInsights:", error);
        // 4. Captura qualquer erro do serviço e retorna em um formato amigável para o front-end
        return { error: error.message || "Ocorreu um erro desconhecido ao buscar os insights." };
    }
}

export async function getAdminCosts() {
    try {
        return await getAdminCostsFromService();
    } catch (error: any) { 
        return { error: error.message }; 
    }
}



// --- Ações de Gerenciamento de Usuário ---

export async function getUsersWithRoles() {
    try {
        return await getUsersWithRolesService();
    } catch (error: any) {
        console.error('Error in action getUsersWithRoles:', error);
        return { error: `Não foi possível buscar a lista de usuários: ${error.message}` };
    }
}

export async function getPreRegisteredUsers() {
    try {
        return await getPreRegisteredUsersService();
    } catch (error: any) {
        console.error('Error in action getPreRegisteredUsers:', error);
        return { error: `Não foi possível buscar os pré-registrados: ${error.message}` };
    }
}

// Renomeei para createUser para manter a consistência com a chamada do front-end
export async function createUser(email: string, role: UserRole) {
    try {
        return await preRegisterUserService(email, role);
    } catch (error: any) {
        console.error(`Error in action createUser for ${email}:`, error);
        return { success: false, error: error.message };
    }
}

export async function setUserRole(userId: string, role: UserRole) {
    try {
        return await setUserRoleService(userId, role);
    } catch (error: any) {
        console.error(`Error in action setUserRole for ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function setUserOnboardingStatus(userId: string, status: boolean) {
    try {
        return await setUserOnboardingStatusService(userId, status);
    } catch (error: any) {
        console.error(`Error in action setUserOnboardingStatus for ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function deleteUser(userId: string) {
    try {
        return await deleteUserService(userId);
    } catch (error: any) {
        console.error(`Error in action deleteUser for ${userId}:`, error);
        return { success: false, error: error.message };
    }
}



// --- Ações de Gerenciamento do Sistema ---

export async function getMaintenanceMode() {
    try {
        return await getMaintenanceModeService();
    } catch (error: any) {
        console.error('Error in action getMaintenanceMode:', error);
        return { error: error.message, isMaintenanceMode: false };
    }
}

export async function setMaintenanceMode(isMaintenanceMode: boolean) {
    try {
        return await setMaintenanceModeService(isMaintenanceMode);
    } catch (error: any) {
        console.error('Error in action setMaintenanceMode:', error);
        return { success: false, error: error.message };
    }
}

export async function runApiHealthCheck() {
    try {
        // A lógica de try/catch para cada API já está no serviço.
        // Este try/catch captura erros inesperados na execução geral.
        return await runApiHealthCheckService();
    } catch (error: any) {
        console.error('Error in action runApiHealthCheck:', error);
        return { error: `Falha crítica ao executar o diagnóstico de APIs: ${error.message}` };
    }
}



// --- Ações de Conteúdo e Feedback ---

export async function getLegalIssueAlerts() {
    try {
        return await getLegalIssueAlertsService();
    } catch (error: any) {
        console.error('Error in action getLegalIssueAlerts:', error);
        return { error: `Não foi possível buscar os alertas jurídicos: ${error.message}` };
    }
}

export async function getFeedbacks() {
    try {
        return await getFeedbacksService();
    } catch (error: any) {
        console.error('Error in action getFeedbacks:', error);
        return { error: `Não foi possível buscar os feedbacks: ${error.message}` };
    }
}
// Se tiver outras actions, como getAdminCosts, elas seguiriam o mesmo padrão.