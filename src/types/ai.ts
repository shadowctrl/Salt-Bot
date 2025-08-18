export interface OpenAIFunction {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<
				string,
				{
					type: string;
					description: string;
					enum?: string[];
				}
			>;
			required: string[];
			additionalProperties: boolean;
		};
	};
}

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
