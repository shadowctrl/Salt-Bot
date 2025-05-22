import client from "../../../salt";
import { Repository, DataSource, In } from "typeorm";
import { RagDocument, RagChunk } from "../entities/rag_data";
import { IDocument } from "../../../types";

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
            const result = await this.dataSource.query(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            );
            return result[0].exists;
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error checking vector extension: ${error}`);
            return false;
        }
    };

    /**
     * Initialize vector columns for existing RAG data
     * This should be called during database startup to ensure vector columns are ready
     */
    initializeVectorColumns = async (): Promise<boolean> => {
        try {
            // Check if there are any existing RAG documents
            const documentCount = await this.documentRepo.count();

            if (documentCount > 0) {
                client.logger.info(`[RAG_REPO] Initializing vector columns for ${documentCount} existing RAG documents`);

                // Initialize with default dimensions (384)
                // This will preserve existing vector data if it exists
                const result = await this.ensureVectorColumn(384);

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
     * Ensure the vector column exists and has the correct type
     */
    private ensureVectorColumn = async (embeddingDimensions?: number): Promise<boolean> => {
        try {
            const hasVectorExtension = await this.checkVectorExtensionAvailable();
            if (!hasVectorExtension) {
                client.logger.warn('[RAG_REPO] Vector extension not available');
                return false;
            }

            const dimensions = embeddingDimensions || 384;

            const columnInfo = await this.dataSource.query(`
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE table_name = 'rag_chunks' AND column_name = 'embedding_vector'
        `);

            if (columnInfo.length === 0) {
                await this.dataSource.query(`
                ALTER TABLE rag_chunks 
                ADD COLUMN embedding_vector vector(${dimensions})
            `);
                client.logger.info(`[RAG_REPO] Created embedding_vector column with ${dimensions} dimensions`);
                return true;
            }

            const column = columnInfo[0];

            if (column.udt_name === 'vector') {
                const vectorDataCount = await this.dataSource.query(`
                SELECT COUNT(*) as count
                FROM rag_chunks 
                WHERE embedding_vector IS NOT NULL
            `);

                const hasVectorData = vectorDataCount[0].count > 0;

                if (hasVectorData) {
                    client.logger.info(`[RAG_REPO] Vector column exists with ${vectorDataCount[0].count} vectors, preserving data`);
                    return true;
                }

                try {
                    const dimensionQuery = await this.dataSource.query(`
                    SELECT atttypmod 
                    FROM pg_attribute 
                    WHERE attrelid = 'rag_chunks'::regclass 
                    AND attname = 'embedding_vector'
                `);

                    if (dimensionQuery[0] && dimensionQuery[0].atttypmod > 0) {
                        const currentDimensions = dimensionQuery[0].atttypmod;
                        if (currentDimensions !== dimensions) {
                            client.logger.info(`[RAG_REPO] Updating vector dimensions from ${currentDimensions} to ${dimensions}`);

                            await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN embedding_vector`);
                            await this.dataSource.query(`
                            ALTER TABLE rag_chunks 
                            ADD COLUMN embedding_vector vector(${dimensions})
                        `);
                        }
                    }
                } catch (dimensionError) {
                    client.logger.debug(`[RAG_REPO] Could not check vector dimensions: ${dimensionError}`);
                }

                return true;
            }

            client.logger.info(`[RAG_REPO] Found ${column.udt_name} column, converting to vector(${dimensions})`);

            let hasConvertibleData = false;
            try {
                const dataCheck = await this.dataSource.query(`
                SELECT COUNT(*) as count
                FROM rag_chunks 
                WHERE embedding_vector IS NOT NULL 
                AND embedding_vector != ''
                AND embedding_vector ~ '^\\[.*\\]
            `);
                hasConvertibleData = dataCheck[0].count > 0;
            } catch (checkError) {
                client.logger.warn(`[RAG_REPO] Could not check for convertible data: ${checkError}`);
            }

            if (hasConvertibleData) {
                client.logger.info(`[RAG_REPO] Attempting to preserve vector data during conversion`);

                try {
                    await this.dataSource.query(`
                    ALTER TABLE rag_chunks 
                    ADD COLUMN embedding_vector_temp vector(${dimensions})
                `);

                    await this.dataSource.query(`
                    UPDATE rag_chunks 
                    SET embedding_vector_temp = embedding_vector::vector 
                    WHERE embedding_vector IS NOT NULL 
                    AND embedding_vector != ''
                    AND embedding_vector ~ '^\\[.*\\]
                `);

                    await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN embedding_vector`);
                    await this.dataSource.query(`ALTER TABLE rag_chunks RENAME COLUMN embedding_vector_temp TO embedding_vector`);

                    client.logger.info(`[RAG_REPO] Successfully converted to vector type with data preservation`);
                    return true;

                } catch (conversionError) {
                    client.logger.error(`[RAG_REPO] Data conversion failed: ${conversionError}`);

                    try {
                        await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN IF EXISTS embedding_vector_temp`);
                    } catch (cleanupError) {
                        client.logger.debug(`[RAG_REPO] Cleanup error: ${cleanupError}`);
                    }
                }
            }

            await this.dataSource.query(`ALTER TABLE rag_chunks DROP COLUMN embedding_vector`);
            await this.dataSource.query(`
            ALTER TABLE rag_chunks 
            ADD COLUMN embedding_vector vector(${dimensions})
        `);

            client.logger.info(`[RAG_REPO] Recreated as vector(${dimensions}) column`);
            return true;

        } catch (error) {
            client.logger.error(`[RAG_REPO] Error ensuring vector column: ${error}`);
            return false;
        }
    };

    /**
     * Check if a guild already has RAG data
     */
    hasRagData = async (guildId: string): Promise<boolean> => {
        try {
            const count = await this.documentRepo.count({
                where: { guildId }
            });
            return count > 0;
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error checking RAG data: ${error}`);
            return false;
        }
    };

    /**
     * Store processed documents and chunks
     */
    storeRagData = async (
        guildId: string,
        fileName: string,
        fileType: string,
        description: string | null,
        processedDocuments: IDocument[]
    ): Promise<RagDocument | null> => {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            let embeddingDimensions = 384;
            if (processedDocuments.length > 0 && processedDocuments[0].embedding) {
                embeddingDimensions = processedDocuments[0].embedding.length;
                client.logger.info(`[RAG_REPO] Detected embedding dimensions: ${embeddingDimensions}`);
            }

            const vectorColumnReady = await this.ensureVectorColumn(embeddingDimensions);

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

                if (doc.embedding) {
                    chunk.embedding = doc.embedding;
                }

                const savedChunk = await queryRunner.manager.save(chunk);

                if (vectorColumnReady && doc.embedding) {
                    try {
                        const vectorString = `[${doc.embedding.join(',')}]`;
                        await queryRunner.query(
                            `UPDATE rag_chunks SET embedding_vector = $1::vector WHERE id = $2`,
                            [vectorString, savedChunk.id]
                        );

                        client.logger.debug(`[RAG_REPO] Stored vector for chunk ${i + 1}/${processedDocuments.length}`);
                    } catch (vectorError) {
                        client.logger.warn(`[RAG_REPO] Failed to store vector for chunk ${savedChunk.id}: ${vectorError}`);
                    }
                }
            }

            await queryRunner.commitTransaction();

            const storedVectors = await this.dataSource.query(`
            SELECT COUNT(*) as count
            FROM rag_chunks c
            INNER JOIN rag_documents d ON d.id = c."documentId"
            WHERE d.id = $1 AND c.embedding_vector IS NOT NULL
        `, [savedDocument.id]);

            const vectorCount = storedVectors[0]?.count || 0;

            if (vectorColumnReady && vectorCount > 0) {
                client.logger.info(`[RAG_REPO] Successfully stored ${processedDocuments.length} chunks with ${vectorCount} vectors for semantic search`);
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
            const documents = await this.documentRepo.find({
                where: { guildId }
            });

            if (documents.length === 0) {
                return false;
            }

            await this.documentRepo.remove(documents);
            return true;
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error deleting RAG data: ${error}`);
            return false;
        }
    };

    /**
     * Search for relevant RAG chunks based on embedding similarity
     */
    searchSimilarChunks = async (
        guildId: string,
        queryEmbedding: number[],
        limit: number = 3
    ): Promise<RagChunk[]> => {
        try {
            const documents = await this.documentRepo.find({
                where: { guildId },
                relations: ['chunks']
            });

            if (documents.length === 0) {
                client.logger.debug('[RAG_REPO] No documents found for guild');
                return [];
            }

            const documentIds = documents.map(doc => doc.id);
            const vectorColumnReady = await this.ensureVectorColumn(queryEmbedding.length);

            if (vectorColumnReady) {
                try {
                    const vectorCount = await this.dataSource.query(`
                    SELECT COUNT(*) as count
                    FROM rag_chunks c
                    INNER JOIN rag_documents d ON d.id = c."documentId"
                    WHERE d.id = ANY($1) AND c.embedding_vector IS NOT NULL
                `, [documentIds]);

                    client.logger.debug(`[RAG_REPO] Found ${vectorCount[0].count} chunks with vector data`);

                    if (vectorCount[0].count > 0) {
                        const vectorString = `[${queryEmbedding.join(',')}]`;
                        const results = await this.dataSource.query(`
                        SELECT c.*, d.id as doc_id, d."guildId", d."fileName", d.description, 
                               d."fileType", d."chunkCount", d."createdAt" as doc_created_at, 
                               d."updatedAt" as doc_updated_at,
                               (c.embedding_vector <-> $2::vector) as distance
                        FROM rag_chunks c
                        INNER JOIN rag_documents d ON d.id = c."documentId"
                        WHERE d.id = ANY($1) AND c.embedding_vector IS NOT NULL
                        ORDER BY c.embedding_vector <-> $2::vector
                        LIMIT $3
                    `, [documentIds, vectorString, limit]);

                        if (results.length > 0) {
                            const chunks: RagChunk[] = [];
                            for (const row of results) {
                                const chunk = new RagChunk();
                                chunk.id = row.id;
                                chunk.content = row.content;
                                chunk.chunkIndex = row.chunkIndex;
                                chunk.embedding = row.embedding ? JSON.parse(row.embedding) : null;

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

                            client.logger.debug(`[RAG_REPO] Vector search returned ${chunks.length} results with distances`);
                            return chunks;
                        } else {
                            client.logger.warn('[RAG_REPO] Vector search returned no results, checking data...');

                            const debugResults = await this.dataSource.query(`
                            SELECT c.id, c.content, c.embedding_vector IS NOT NULL as has_vector
                            FROM rag_chunks c
                            INNER JOIN rag_documents d ON d.id = c."documentId"
                            WHERE d.id = ANY($1)
                            LIMIT 5
                        `, [documentIds]);

                            client.logger.debug(`[RAG_REPO] Debug - Found ${debugResults.length} chunks, vector status: ${JSON.stringify(debugResults.map((r: { id: number, has_vector: boolean }) => ({ id: r.id, hasVector: r.has_vector })))}`);
                        }
                    } else {
                        client.logger.warn('[RAG_REPO] No vector data available, using fallback search');

                        const debugChunks = await this.dataSource.query(`
                        SELECT COUNT(*) as total_chunks,
                               COUNT(c.embedding_vector) as chunks_with_vectors
                        FROM rag_chunks c
                        INNER JOIN rag_documents d ON d.id = c."documentId"
                        WHERE d.id = ANY($1)
                    `, [documentIds]);

                        client.logger.debug(`[RAG_REPO] Debug info: Total chunks: ${debugChunks[0].total_chunks}, Chunks with vectors: ${debugChunks[0].chunks_with_vectors}`);
                    }
                } catch (vectorError) {
                    client.logger.warn(`[RAG_REPO] Vector search failed, falling back to simple search: ${vectorError}`);
                }
            } else {
                client.logger.info('[RAG_REPO] Vector column not ready, using fallback search');
            }

            client.logger.debug('[RAG_REPO] Using fallback text-based search method');
            const fallbackResults = await this.chunkRepo.find({
                where: { document: { id: In(documentIds) } },
                relations: ['document'],
                take: limit,
                order: { chunkIndex: 'ASC' }
            });

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
            return await this.documentRepo.findOne({
                where: { guildId },
                relations: ['chunks']
            });
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error getting RAG document info: ${error}`);
            return null;
        }
    };
}