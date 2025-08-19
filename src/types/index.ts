


export interface AttachedFile {
    id: string;
    fileName: string;
    mimeType: string;
    storagePath: string;
    downloadURL: string;
    deidentifiedContent?: string;
}

export type UserRole = 'admin' | 'beta' | 'user';

    
