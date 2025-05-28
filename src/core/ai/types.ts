export interface IMetadata {
    source: {
        name: string;
        path: string;
        type: 'txt' | 'md';
    };
    createdAt: Date;
    updatedAt: Date;
    tags: string[];
    chunkIndex: number;
    totalChunks: number;
    wordCount: number;
    charCount: number;
    hash?: string;
}

export interface IDocument {
    content: string;
    metadata: IMetadata;
    embedding?: number[];
}

export interface IProcessingOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    tags?: string[];
    skipEmbedding?: boolean;
    deduplicate?: boolean;
    customSeparators?: string[];
    maxConcurrentEmbeddings?: number;
}