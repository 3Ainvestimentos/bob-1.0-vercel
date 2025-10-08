// src/app/admin/_lib/content.service.ts

import { getAuthenticatedFirestoreAdmin, getAuthenticatedAuthAdmin} from '@/lib/server/firebase';
import { Timestamp } from 'firebase-admin/firestore';
// Supondo que você tenha tipos definidos em algum lugar como 'src/types.ts'
// Se não, você pode usar 'any' temporariamente.
import { Feedback, LegalIssueAlert } from '@/types'; 

async function fetchAndMapUserData(userIds: string[], adminDb: FirebaseFirestore.Firestore) {
    if (userIds.length === 0) return new Map();

    const userRefs = userIds.map(uid => adminDb.collection('users').doc(uid));
    const userSnapshots = await adminDb.getAll(...userRefs);
    
    const userMap = new Map<string, { email?: string; displayName?: string }>();
    userSnapshots.forEach(doc => {
        if (doc.exists) {
            const data = doc.data();
            userMap.set(doc.id, { email: data?.email, displayName: data?.displayName });
        }
    });
    return userMap;
}

export async function getLegalIssueAlertsService(): Promise<LegalIssueAlert[]> {
    const adminDb = await getAuthenticatedFirestoreAdmin();
    const alertsSnapshot = await adminDb.collection('legal_issue_alerts').orderBy('reportedAt', 'desc').get();

    if (alertsSnapshot.empty) {
        return [];
    }
    
    const userIds = alertsSnapshot.docs.map(doc => doc.data().userId).filter(Boolean);
    const userMap = await fetchAndMapUserData(userIds, adminDb);

    const alerts = alertsSnapshot.docs.map(doc => {
        const data = doc.data();
        const user = userMap.get(data.userId) || { email: 'Usuário não encontrado' };
        return {
            id: doc.id,
            user,
            reportedAt: (data.reportedAt as Timestamp)?.toDate().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            userQuery: data.userQuery,
            assistantResponse: data.assistantResponse,
            comment: data.comment,
        } as LegalIssueAlert;
    });

    return alerts;
}


export async function getFeedbacksService(): Promise<{ positive: Feedback[], negative: Feedback[] }> {
    const adminDb = await getAuthenticatedFirestoreAdmin();
    const feedbacksSnapshot = await adminDb.collectionGroup('feedbacks').orderBy('updatedAt', 'desc').get();

    const feedbacks = {
        positive: [] as Feedback[],
        negative: [] as Feedback[],
    };

    if (feedbacksSnapshot.empty) {
        return feedbacks;
    }
    
    const userIds = feedbacksSnapshot.docs.map(doc => doc.data().userId).filter(Boolean);
    const userMap = await fetchAndMapUserData(userIds, adminDb);

    feedbacksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const user = userMap.get(data.userId) || { email: 'Usuário não encontrado' };

        const feedbackItem: Feedback = {
            id: doc.id,
            user,
            updatedAt: (data.updatedAt as Timestamp)?.toDate().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            rating: data.rating,
            userQuery: data.userQuery,
            assistantResponse: data.assistantResponse,
            comment: data.comment,
        };

        if (feedbackItem.rating === 'positive') {
            feedbacks.positive.push(feedbackItem);
        } else if (feedbackItem.rating === 'negative') {
            feedbacks.negative.push(feedbackItem);
        }
    });

    return feedbacks;
}