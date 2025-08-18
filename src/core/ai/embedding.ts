import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

import client from '../../salt';

/**
 * Embedding class for generating embeddings using a transformer model.
 * This class uses the `@xenova/transformers` library to create embeddings for text.
 */
export class Embedding {
	private readonly model: string;
	private readonly maxRetries: number;
	private readonly retryDelayMs: number;
	private pipeline: FeatureExtractionPipeline | null = null;
	private detectedDimensions: number | null = null;

	constructor(model: string = client.config.ai.chatbot.embedding.model, maxRetries: number = 3, retryDelayMs: number = 1000) {
		//Xenova/all-distilroberta-v1 and Xenova/all-MiniLM-L6-v2
		this.model = model;
		this.maxRetries = maxRetries;
		this.retryDelayMs = retryDelayMs;
	}

	/**
	 * Creates a pipeline for feature extraction using the specified model.
	 * @returns {Promise<FeatureExtractionPipeline>} - The feature extraction pipeline.
	 */
	private getPipeline = async (): Promise<FeatureExtractionPipeline> => {
		if (!this.pipeline) {
			this.pipeline = await pipeline('feature-extraction', this.model);
		}
		return this.pipeline;
	};

	/**
	 * Detects the dimensions of the embedding model by creating a test embedding
	 * @returns {Promise<number>} - The detected embedding dimensions
	 */
	private detectDimensions = async (): Promise<number> => {
		if (this.detectedDimensions !== null) {
			return this.detectedDimensions;
		}

		try {
			const testEmbedding = await this.create('test', { skipDimensionCache: true });
			this.detectedDimensions = testEmbedding.length;
			return this.detectedDimensions;
		} catch (error) {
			client.logger.warn(`[EMBEDDING] Could not detect dimensions for model ${this.model}, defaulting to 384`);
			this.detectedDimensions = 384;
			return 384;
		}
	};

	/**
	 * Generates embeddings for the given text.
	 * @param {string} text - The text to generate embeddings for.
	 * @param {object} options - Additional options for the pipeline.
	 * @returns {Promise<number[]>} - The generated embeddings as a number array.
	 * @throws {Error} - Throws an error if the pipeline creation or embedding generation fails.
	 */
	public create = async (text: string, options?: Record<string, any> & { skipDimensionCache?: boolean }): Promise<number[]> => {
		const extractor = await this.getPipeline();
		if (!extractor) {
			throw new Error('Failed to create pipeline');
		}

		let retries = 0;

		while (true) {
			try {
				const embeddings = await extractor(text, { pooling: 'mean', normalize: true, ...options });

				if (!embeddings) {
					throw new Error('No embeddings returned');
				}

				let embeddingArray: number[];

				if (embeddings.data) {
					embeddingArray = Array.from(embeddings.data as Float32Array | number[]);
				} else if (Array.isArray(embeddings)) {
					embeddingArray = embeddings.flat();
				} else {
					embeddingArray = Array.from(embeddings as any);
				}

				if (this.detectedDimensions === null && !options?.skipDimensionCache) {
					this.detectedDimensions = embeddingArray.length;
				}

				return embeddingArray;
			} catch (error: Error | any) {
				retries++;

				if (retries >= this.maxRetries) {
					throw new Error(`Failed to generate embeddings after ${this.maxRetries} attempts: ${error.message}`);
				}

				await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
				client.logger.log(`Retrying embedding generation, attempt ${retries + 1} of ${this.maxRetries}`);
			}
		}
	};

	/**
	 * Get the detected dimension size for the current model
	 * @returns {Promise<number>} - The detected embedding dimension size
	 */
	public getExpectedDimensions = async (): Promise<number> => {
		return await this.detectDimensions();
	};

	/**
	 * Get cached dimensions if available, otherwise detect them
	 * @returns {number | null} - The cached dimensions or null if not yet detected
	 */
	public getCachedDimensions = (): number | null => {
		return this.detectedDimensions;
	};

	/**
	 * Reset the cached dimensions (useful when switching models)
	 */
	public resetDimensionsCache = (): void => {
		this.detectedDimensions = null;
	};
}
