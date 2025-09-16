import client from '../../../../salt';
import { Repository, DataSource, In } from 'typeorm';

import { IDocument } from '../../../../types';
import { RagDocument, RagChunk } from '../../entities/chat_bot';

export class RagRepository {
	private documentRepo: Repository<RagDocument>;
	private chunkRepo: Repository<RagChunk>;
	private dataSource: DataSource;

	constructor(dataSource: DataSource) {
		this.dataSource = dataSource;
		this.documentRepo = dataSource.getRepository(RagDocument);
		this.chunkRepo = dataSource.getRepository(RagChunk);
	}

	/**
	 * Check if the vector extension is available in the database
	 */
	private checkVectorExtensionAvailable = async (): Promise<boolean> => {
		try {
			const result = await this.dataSource.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')");
			return result[0].exists;
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error checking vector extension: ${error}`);
			return false;
		}
	};

	/**
	 * Detect embedding dimensions from existing data or return null
	 */
	private detectExistingDimensions = async (): Promise<number | null> => {
		try {
			const hasVectorExtension = await this.checkVectorExtensionAvailable();
			if (!hasVectorExtension) return null;
			const sampleChunk = await this.dataSource.query(`
                SELECT embedding 
                FROM rag_chunks 
                WHERE embedding IS NOT NULL 
                LIMIT 1
            `);
			if (sampleChunk.length > 0 && sampleChunk[0].embedding) {
				try {
					const embeddingData = sampleChunk[0].embedding;
					let dimensions: number;
					if (typeof embeddingData === 'string') {
						const parsed = JSON.parse(embeddingData);
						dimensions = Array.isArray(parsed) ? parsed.length : 0;
					} else if (Array.isArray(embeddingData)) {
						dimensions = embeddingData.length;
					} else {
						return null;
					}
					client.logger.info(`[RAG_REPO] Detected existing embedding dimensions: ${dimensions}`);
					return dimensions;
				} catch (parseError) {
					client.logger.warn(`[RAG_REPO] Could not parse existing embedding data: ${parseError}`);
					return null;
				}
			}
			return null;
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error detecting existing dimensions: ${error}`);
			return null;
		}
	};

	/**
	 * Ensure the embedding column has the correct vector type with dynamic dimensions
	 */
	private ensureVectorColumn = async (embeddingDimensions?: number): Promise<boolean> => {
		try {
			const hasVectorExtension = await this.checkVectorExtensionAvailable();
			if (!hasVectorExtension) {
				client.logger.warn('[RAG_REPO] Vector extension not available');
				return false;
			}
			let dimensions = embeddingDimensions;
			if (!dimensions) {
				dimensions = (await this.detectExistingDimensions()) ?? undefined;
			}
			if (!dimensions) {
				client.logger.info('[RAG_REPO] No embedding dimensions provided and none detected from existing data');
				return false;
			}
			const columnInfo = await this.dataSource.query(`
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns 
                WHERE table_name = 'rag_chunks' AND column_name = 'embedding'
            `);
			if (columnInfo.length === 0) {
				await this.dataSource.query(`
                    ALTER TABLE rag_chunks 
                    ADD COLUMN embedding vector(${dimensions})
                `);
				client.logger.info(`[RAG_REPO] Created embedding column with vector(${dimensions}) type`);
				return true;
			}

			const column = columnInfo[0];

			if (column.udt_name === 'vector') {
				const constraintInfo = await this.dataSource.query(`
                    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) as column_type
                    FROM pg_catalog.pg_attribute a
                    WHERE a.attnum > 0 
                    AND NOT a.attisdropped
                    AND a.attrelid = (
                        SELECT c.oid 
                        FROM pg_catalog.pg_class c 
                        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace 
                        WHERE c.relname = 'rag_chunks'
                    )
                    AND a.attname = 'embedding'
                `);
				if (constraintInfo.length > 0) {
					const columnType = constraintInfo[0].column_type;
					const dimensionMatch = columnType.match(/vector\((\d+)\)/);
					const existingDimensions = dimensionMatch ? parseInt(dimensionMatch[1]) : null;
					if (existingDimensions === dimensions) {
						client.logger.debug(`[RAG_REPO] Embedding column already has correct vector(${dimensions}) type`);
						return true;
					} else if (existingDimensions) {
						client.logger.warn(`[RAG_REPO] Existing vector column has ${existingDimensions} dimensions, but need ${dimensions}`);
						return false;
					}
				}
				client.logger.debug('[RAG_REPO] Embedding column already has vector type');
				return true;
			}
			client.logger.info(`[RAG_REPO] Converting embedding column from ${column.udt_name} to vector(${dimensions})`);
			let hasConvertibleData = false;
			try {
				const dataCheck = await this.dataSource.query(`
                    SELECT COUNT(*) as count
                    FROM rag_chunks 
                    WHERE embedding IS NOT NULL 
                    AND embedding != ''
                    AND embedding ~ '^\\[.*\\]$'
                `);
				hasConvertibleData = dataCheck[0].count > 0;
			} catch (checkError) {
				client.logger.warn(`[RAG_REPO] Could not check for convertible data: ${checkError}`);
			}

			if (hasConvertibleData) {
				try {
					await this.dataSource.query(`
                        ALTER TABLE rag_chunks 
                        ADD COLUMN embedding_temp vector(${dimensions})
                    `);

					await this.dataSource.query(`
                        UPDATE rag_chunks 
                        SET embedding_temp = embedding::vector 
                        WHERE embedding IS NOT NULL 
                        AND embedding != ''
                        AND embedding ~ '^\\[.*\\]$'
                    `);

					await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN embedding`);
					await this.dataSource.query(`ALTER TABLE rag_chunks RENAME COLUMN embedding_temp TO embedding`);

					client.logger.info(`[RAG_REPO] Successfully converted embedding column to vector(${dimensions}) type with data preservation`);
					return true;
				} catch (conversionError) {
					client.logger.error(`[RAG_REPO] Data conversion failed: ${conversionError}`);
					try {
						await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN IF EXISTS embedding_temp`);
					} catch (cleanupError) {
						client.logger.debug(`[RAG_REPO] Cleanup error: ${cleanupError}`);
					}
				}
			}

			await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN embedding`);
			await this.dataSource.query(`
                ALTER TABLE rag_chunks 
                ADD COLUMN embedding vector(${dimensions})
            `);

			client.logger.info(`[RAG_REPO] Recreated embedding column as vector(${dimensions})`);
			return true;
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error ensuring vector column: ${error}`);
			return false;
		}
	};

	/**
	 * Initialize vector columns for existing RAG data
	 */
	initializeVectorColumns = async (): Promise<boolean> => {
		try {
			const documentCount = await this.documentRepo.count();

			if (documentCount > 0) {
				client.logger.info(`[RAG_REPO] Initializing vector columns for ${documentCount} existing RAG documents`);

				const existingDimensions = await this.detectExistingDimensions();
				const result = await this.ensureVectorColumn(existingDimensions || undefined);

				if (result) {
					client.logger.info('[RAG_REPO] Vector columns initialized successfully');
				} else {
					client.logger.warn('[RAG_REPO] Vector column initialization failed, will use fallback search');
				}

				return result;
			} else {
				client.logger.debug('[RAG_REPO] No existing RAG documents found');
				return true;
			}
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error initializing vector columns: ${error}`);
			return false;
		}
	};

	/**
	 * Check if a guild already has RAG data
	 */
	hasRagData = async (guildId: string): Promise<boolean> => {
		try {
			const count = await this.documentRepo.count({
				where: { guildId },
			});
			return count > 0;
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error checking RAG data: ${error}`);
			return false;
		}
	};

	/**
	 * Store processed documents and chunks with dynamic embedding dimensions
	 */
	storeRagData = async (guildId: string, fileName: string, fileType: string, description: string | null, processedDocuments: IDocument[]): Promise<RagDocument | null> => {
		const queryRunner = this.dataSource.createQueryRunner();
		await queryRunner.connect();
		await queryRunner.startTransaction();

		try {
			let embeddingDimensions: number | null = null;
			if (processedDocuments.length > 0 && processedDocuments[0].embedding) {
				embeddingDimensions = processedDocuments[0].embedding.length;
				client.logger.info(`[RAG_REPO] Detected embedding dimensions from data: ${embeddingDimensions}`);
			}

			if (embeddingDimensions) {
				const inconsistentEmbedding = processedDocuments.find((doc) => doc.embedding && doc.embedding.length !== embeddingDimensions);
				if (inconsistentEmbedding) throw new Error(`Inconsistent embedding dimensions found. Expected ${embeddingDimensions}, but found ${inconsistentEmbedding.embedding?.length}`);
			}

			const vectorColumnReady = embeddingDimensions ? await this.ensureVectorColumn(embeddingDimensions) : false;

			const document = new RagDocument();
			document.guildId = guildId;
			document.fileName = fileName;
			document.fileType = fileType;
			document.description = description || '';
			document.chunkCount = processedDocuments.length;
			const savedDocument = await queryRunner.manager.save(document);

			for (let i = 0; i < processedDocuments.length; i++) {
				const doc = processedDocuments[i];

				const chunk = new RagChunk();
				chunk.content = doc.content;
				chunk.chunkIndex = doc.metadata.chunkIndex;
				chunk.document = savedDocument;

				if (vectorColumnReady && doc.embedding) {
					const vectorString = `[${doc.embedding.join(',')}]`;
					await queryRunner.query(
						`INSERT INTO rag_chunks (id, content, "chunkIndex", "documentId", embedding) 
                         VALUES ($1, $2, $3, $4, $5::vector)`,
						[chunk.id || require('crypto').randomUUID(), chunk.content, chunk.chunkIndex, savedDocument.id, vectorString]
					);
				} else {
					chunk.embedding = doc.embedding;
					await queryRunner.manager.save(chunk);
				}

				client.logger.debug(`[RAG_REPO] Stored chunk ${i + 1}/${processedDocuments.length}`);
			}

			await queryRunner.commitTransaction();

			const storedVectors = await this.dataSource.query(
				`
                SELECT COUNT(*) as count
                FROM rag_chunks c
                INNER JOIN rag_documents d ON d.id = c."documentId"
                WHERE d.id = $1 AND c.embedding IS NOT NULL
            `,
				[savedDocument.id]
			);

			const vectorCount = storedVectors[0]?.count || 0;

			if (vectorColumnReady && vectorCount > 0) {
				client.logger.info(`[RAG_REPO] Successfully stored ${processedDocuments.length} chunks with ${vectorCount} vectors (${embeddingDimensions} dimensions) for semantic search`);
			} else {
				client.logger.info(`[RAG_REPO] Successfully stored ${processedDocuments.length} chunks with fallback text search capability`);
			}

			return savedDocument;
		} catch (error) {
			await queryRunner.rollbackTransaction();
			client.logger.error(`[RAG_REPO] Error storing RAG data: ${error}`);
			return null;
		} finally {
			await queryRunner.release();
		}
	};

	/**
	 * Delete all RAG data for a guild
	 */
	deleteRagData = async (guildId: string): Promise<boolean> => {
		try {
			const documents = await this.documentRepo.find({ where: { guildId } });
			if (documents.length === 0) return false;
			await this.documentRepo.remove(documents);
			return true;
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error deleting RAG data: ${error}`);
			return false;
		}
	};

	/**
	 * Search for relevant RAG chunks based on embedding similarity with dynamic dimensions
	 */
	searchSimilarChunks = async (guildId: string, queryEmbedding: number[], limit: number = 3): Promise<RagChunk[]> => {
		try {
			const documents = await this.documentRepo.find({ where: { guildId }, relations: ['chunks'] });
			if (documents.length === 0) {
				client.logger.debug('[RAG_REPO] No documents found for guild');
				return [];
			}

			const documentIds = documents.map((doc) => doc.id);
			const vectorColumnReady = await this.ensureVectorColumn(queryEmbedding.length);
			if (vectorColumnReady) {
				try {
					const vectorCount = await this.dataSource.query(
						`
                        SELECT COUNT(*) as count
                        FROM rag_chunks c
                        INNER JOIN rag_documents d ON d.id = c."documentId"
                        WHERE d.id = ANY($1) AND c.embedding IS NOT NULL
                    `,
						[documentIds]
					);

					client.logger.debug(`[RAG_REPO] Found ${vectorCount[0].count} chunks with vector data`);

					if (vectorCount[0].count > 0) {
						const vectorString = `[${queryEmbedding.join(',')}]`;
						const results = await this.dataSource.query(
							`
                            SELECT c.*, d.id as doc_id, d."guildId", d."fileName", d.description, 
                                   d."fileType", d."chunkCount", d."createdAt" as doc_created_at, 
                                   d."updatedAt" as doc_updated_at,
                                   (c.embedding <-> $2::vector) as distance
                            FROM rag_chunks c
                            INNER JOIN rag_documents d ON d.id = c."documentId"
                            WHERE d.id = ANY($1) AND c.embedding IS NOT NULL
                            ORDER BY c.embedding <-> $2::vector
                            LIMIT $3
                        `,
							[documentIds, vectorString, limit]
						);

						if (results.length > 0) {
							const chunks: RagChunk[] = [];
							for (const row of results) {
								const chunk = new RagChunk();
								chunk.id = row.id;
								chunk.content = row.content;
								chunk.chunkIndex = row.chunkIndex;
								chunk.embedding = row.embedding;

								const document = new RagDocument();
								document.id = row.doc_id;
								document.guildId = row.guildId;
								document.fileName = row.fileName;
								document.description = row.description;
								document.fileType = row.fileType;
								document.chunkCount = row.chunkCount;
								document.createdAt = row.doc_created_at;
								document.updatedAt = row.doc_updated_at;

								chunk.document = document;
								chunks.push(chunk);
							}

							client.logger.debug(`[RAG_REPO] Vector search returned ${chunks.length} results`);
							return chunks;
						}
					}
				} catch (vectorError) {
					client.logger.warn(`[RAG_REPO] Vector search failed, falling back to simple search: ${vectorError}`);
				}
			}

			client.logger.debug('[RAG_REPO] Using fallback text-based search method');
			const fallbackResults = await this.chunkRepo.find({ where: { document: { id: In(documentIds) } }, relations: ['document'], take: limit, order: { chunkIndex: 'ASC' } });

			client.logger.debug(`[RAG_REPO] Fallback search returned ${fallbackResults.length} results`);
			return fallbackResults;
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error searching similar chunks: ${error}`);
			return [];
		}
	};

	/**
	 * Get RAG document info for a guild
	 */
	getRagDocumentInfo = async (guildId: string): Promise<RagDocument | null> => {
		try {
			return await this.documentRepo.findOne({ where: { guildId }, relations: ['chunks'] });
		} catch (error) {
			client.logger.error(`[RAG_REPO] Error getting RAG document info: ${error}`);
			return null;
		}
	};
}
