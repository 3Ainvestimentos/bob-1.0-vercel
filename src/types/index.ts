

export const ADMIN_UID = "A2zB0EC9FsMvVAdzFJaFcQsfewh1";

export interface AttachedFile {
    id: string;
    fileName: string;
    mimeType: string;
    deidentifiedContent?: string;
}

export type UserRole = 'admin' | 'beta' | 'user';

    