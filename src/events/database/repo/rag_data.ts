import client from "../../../salt";
import { Repository, DataSource } from "typeorm";
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
     * Check if a guild already has RAG data
     */
    async hasRagData(guildId: string): Promise<boolean> {
        try {
            const count = await this.documentRepo.count({
                where: { guildId }
            });
            return count > 0;
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error checking RAG data: ${error}`);
            return false;
        }
    }

    /**
     * Store processed documents and chunks
     */
    async storeRagData(
        guildId: string,
        fileName: string,
        fileType: string,
        description: string | null,
        processedDocuments: IDocument[]
    ): Promise<RagDocument | null> {
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

            for (const doc of processedDocuments) {
                const chunk = new RagChunk();
                chunk.content = doc.content;
                chunk.chunkIndex = doc.metadata.chunkIndex;
                chunk.document = savedDocument;

                if (doc.embedding) {
                    chunk.embedding = doc.embedding;
                }

                await queryRunner.manager.save(chunk);
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
    }

    /**
     * Delete all RAG data for a guild
     */
    async deleteRagData(guildId: string): Promise<boolean> {
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
    }

    /**
     * Search for relevant RAG chunks based on embedding similarity
     */
    async searchSimilarChunks(
        guildId: string,
        queryEmbedding: number[],
        limit: number = 3
    ): Promise<RagChunk[]> {
        try {
            const documents = await this.documentRepo.find({
                where: { guildId },
                relations: ['chunks']
            });

            if (documents.length === 0) {
                return [];
            }

            const documentIds = documents.map(doc => doc.id);
            
            const chunks = await this.chunkRepo
                .createQueryBuilder('chunk')
                .innerJoinAndSelect('chunk.document', 'document')
                .where('document.id IN (:...documentIds)', { documentIds })
                .orderBy(`chunk.embedding <-> :embedding`, 'ASC')
                .setParameter('embedding', `[${queryEmbedding.join(',')}]`)
                .limit(limit)
                .getMany();

            return chunks;
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error searching similar chunks: ${error}`);
            return [];
        }
    }

    /**
     * Get RAG document info for a guild
     */
    async getRagDocumentInfo(guildId: string): Promise<RagDocument | null> {
        try {
            return await this.documentRepo.findOne({
                where: { guildId },
                relations: ['chunks']
            });
        } catch (error) {
            client.logger.error(`[RAG_REPO] Error getting RAG document info: ${error}`);
            return null;
        }
    }
}