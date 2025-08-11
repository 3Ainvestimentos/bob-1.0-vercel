

export interface AttachedFile {
    id: string;
    fileName: string;
    mimeType: string;
    deidentifiedContent?: string;
}

export type UserRole = 'admin' | 'beta' | 'user';

    