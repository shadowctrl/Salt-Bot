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
            const document = new RagDocument();
            document.guildId = guildId;
            document.fileName = fileName;
            document.fileType = fileType;
            document.description = description || '';
            document.chunkCount = processedDocuments.length;

            const savedDocument = await queryRunner.manager.save(document);
            const hasVectorExtension = await this.checkVectorExtensionAvailable();

            for (const doc of processedDocuments) {
                const chunk = new RagChunk();
                chunk.content = doc.content;
                chunk.chunkIndex = doc.metadata.chunkIndex;
                chunk.document = savedDocument;

                if (doc.embedding) {
                    chunk.embedding = doc.embedding;
                }

                const savedChunk = await queryRunner.manager.save(chunk);

                if (hasVectorExtension && doc.embedding) {
                    try {
                        const vectorString = `[${doc.embedding.join(',')}]`;
                        await queryRunner.query(
                            `UPDATE rag_chunks SET embedding_vector = $1::vector WHERE id = $2`,
                            [vectorString, savedChunk.id]
                        );
                    } catch (vectorError) {
                        client.logger.warn(`[RAG_REPO] Failed to store vector for chunk ${savedChunk.id}: ${vectorError}`);
                    }
                }
            }

            await queryRunner.commitTransaction();
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
                return [];
            }

            const documentIds = documents.map(doc => doc.id);
            const hasVectorExtension = await this.checkVectorExtensionAvailable();

            if (hasVectorExtension) {
                try {
                    const columnExists = await this.dataSource.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.columns 
                            WHERE table_name = 'rag_chunks' AND column_name = 'embedding_vector'
                        )
                    `);

                    if (columnExists[0].exists) {
                        const vectorString = `[${queryEmbedding.join(',')}]`;

                        const results = await this.dataSource.query(`
                            SELECT c.*, d.*
                            FROM rag_chunks c
                            INNER JOIN rag_documents d ON d.id = c."documentId"
                            WHERE d.id = ANY($1) AND c.embedding_vector IS NOT NULL
                            ORDER BY c.embedding_vector <-> $2::vector
                            LIMIT $3
                        `, [documentIds, vectorString, limit]);

                        const chunks: RagChunk[] = [];
                        for (const row of results) {
                            const chunk = new RagChunk();
                            chunk.id = row.id;
                            chunk.content = row.content;
                            chunk.chunkIndex = row.chunkIndex;
                            chunk.embedding = row.embedding ? JSON.parse(row.embedding) : null;

                            const document = new RagDocument();
                            document.id = row.documentId;
                            document.guildId = row.guildId;
                            document.fileName = row.fileName;
                            document.description = row.description;
                            document.fileType = row.fileType;
                            document.chunkCount = row.chunkCount;
                            document.createdAt = row.createdAt;
                            document.updatedAt = row.updatedAt;

                            chunk.document = document;
                            chunks.push(chunk);
                        }

                        return chunks;
                    } else {
                        client.logger.warn(`[RAG_REPO] Vector column not found, using fallback search`);
                        throw new Error('Vector column not available');
                    }
                } catch (vectorError) {
                    client.logger.warn(`[RAG_REPO] Vector search failed, falling back to simple search: ${vectorError}`);
                    return await this.chunkRepo.find({
                        where: { document: { id: In(documentIds) } },
                        relations: ['document'],
                        take: limit
                    });
                }
            } else {
                client.logger.warn(`[RAG_REPO] Vector extension not available, using fallback search method`);
                return await this.chunkRepo.find({
                    where: { document: { id: In(documentIds) } },
                    relations: ['document'],
                    take: limit
                });
            }
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