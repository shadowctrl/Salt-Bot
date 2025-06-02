import discord from "discord.js";
import { DataSource } from "typeorm";

import client from "../../../salt";
import { RagRepository } from "../repo/chat_bot";
import { AppDataSource } from "./connect_postgres";
import { EncryptionUtil } from "../../../utils/encryption";
import { ChatbotConfigRepository } from "../../database/repo/chat_bot";


/**
 * Initializes the pgvector extension in PostgreSQL if not already active.
 * @param dataSource - The TypeORM DataSource instance.
 * @return {Promise<boolean>} True if the vector extension is active, false otherwise.
 */
const initializeVectorExtension = async (dataSource: DataSource): Promise<boolean> => {
    try {
        const extensionCheck = await dataSource.query(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        );

        if (extensionCheck[0].exists) {
            client.logger.info('[DATABASE] Vector extension is already active');
            return true;
        }

        try {
            await dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
            client.logger.info('[DATABASE] Vector extension created successfully');

            const verifyResult = await dataSource.query(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            );

            if (verifyResult[0].exists) {
                client.logger.info('[DATABASE] Vector extension is active and ready for use');

                try {
                    await dataSource.query("SELECT '[1,2,3]'::vector");
                    client.logger.debug('[DATABASE] Vector type conversion test passed');
                    return true;
                } catch (testError) {
                    client.logger.warn(`[DATABASE] Vector type test failed: ${testError}`);
                    return false;
                }
            } else {
                client.logger.warn('[DATABASE] Vector extension installation verification failed');
                return false;
            }

        } catch (createError: any) {
            if (createError.message.includes('permission denied') ||
                createError.message.includes('must be owner')) {
                client.logger.error('[DATABASE] Insufficient permissions to create vector extension. Contact your database administrator.');
            } else if (createError.message.includes('could not open extension control file') ||
                createError.message.includes('extension "vector" is not available')) {
                client.logger.error('[DATABASE] pgvector extension is not available in this database instance. Please install pgvector or use a database service that supports it.');
            } else {
                client.logger.error(`[DATABASE] Failed to create vector extension: ${createError.message}`);
            }
            return false;
        }

    } catch (error: any) {
        client.logger.error(`[DATABASE] Error during vector extension initialization: ${error.message}`);
        client.logger.warn('[DATABASE] RAG functionality will use fallback similarity search without vector operations');
        return false;
    }
};

/**
 * Initializes the PostgreSQL database connection and sets up the RAG repository.
 * @param client - The Discord client instance.
 * @return {Promise<DataSource>} The initialized TypeORM DataSource.
 * @throws {Error} If the database connection or initialization fails.
 */
export const initializeDatabase = async (client: discord.Client): Promise<DataSource> => {
    try {
        const dataSource = await AppDataSource.initialize();
        client.logger.success('[DATABASE] Connected to PostgreSQL database');

        const vectorSupported = await initializeVectorExtension(dataSource);

        if (vectorSupported) {
            (dataSource.driver as any).supportedDataTypes.push('vector');
            (dataSource.driver as any).withLengthColumnTypes.push('vector');
            client.logger.info('[DATABASE] Vector data type support enabled in TypeORM');
        } else {
            client.logger.warn('[DATABASE] Vector data type support disabled - using fallback text search');
        }

        try {
            await dataSource.synchronize();
            client.logger.info('[DATABASE] Database schema synchronized');
        } catch (syncError) {
            client.logger.error(`[DATABASE] Schema synchronization failed: ${syncError}`);
            throw syncError;
        }

        if (vectorSupported) {
            try {
                const ragRepo = new RagRepository(dataSource);
                await ragRepo.initializeVectorColumns();
                client.logger.info('[DATABASE] RAG vector columns initialized');
            } catch (ragError) {
                client.logger.warn(`[DATABASE] Could not initialize RAG vector columns: ${ragError}`);
                client.logger.info('[DATABASE] RAG will use fallback text search');
            }
        }

        return dataSource;
    } catch (error) {
        client.logger.error(`[DATABASE] Error initializing PostgreSQL: ${error}`);
        throw error;
    }
};

/**
 * Initializes encryption validation and migration for chatbot configurations.
 * @param client - The Discord client instance.
 * @return {Promise<void>}
 * @throws {Error} If encryption validation fails in production.
 */
export const initializeEncryption = async (client: discord.Client): Promise<void> => {
    try {
        client.logger.debug('[ENCRYPTION_VALIDATION] Starting encryption validation and migration...');

        const keyValidation = EncryptionUtil.validateMasterKey();

        if (!keyValidation.isValid) {
            client.logger.error(`[ENCRYPTION_VALIDATION] ${keyValidation.message}`);
            client.logger.error('[ENCRYPTION_VALIDATION] Recommendations:');
            keyValidation.recommendations.forEach(rec => {
                client.logger.error(`[ENCRYPTION_VALIDATION] - ${rec}`);
            });

            if (process.env.NODE_ENV !== 'development') {
                client.logger.error('[ENCRYPTION_VALIDATION] Bot cannot start without valid encryption key in production');
                process.exit(1);
            }
        } else {
            if (keyValidation.recommendations.length > 0) {
                client.logger.warn('[ENCRYPTION_VALIDATION] Encryption key recommendations:');
                keyValidation.recommendations.forEach(rec => {
                    client.logger.warn(`[ENCRYPTION_VALIDATION] - ${rec}`);
                });
            }
        }

        const chatbotRepo = new ChatbotConfigRepository((client as any).dataSource);
        const migrationResult = await chatbotRepo.validateAndMigrateEncryption();

        client.logger.debug(`[ENCRYPTION_VALIDATION] Migration completed:`);
        client.logger.debug(`[ENCRYPTION_VALIDATION] - Total configurations: ${migrationResult.totalConfigs}`);
        client.logger.debug(`[ENCRYPTION_VALIDATION] - Encrypted configurations: ${migrationResult.encryptedConfigs}`);
        client.logger.debug(`[ENCRYPTION_VALIDATION] - Plaintext configurations: ${migrationResult.plaintextConfigs}`);

        if (migrationResult.migrationErrors > 0) {
            client.logger.error(`[ENCRYPTION_VALIDATION] - Migration errors: ${migrationResult.migrationErrors}`);
        }

        if (migrationResult.totalConfigs > 0) {
            const encryptionRate = (migrationResult.encryptedConfigs / migrationResult.totalConfigs) * 100;
            client.logger.debug(`[ENCRYPTION_VALIDATION] - Encryption rate: ${encryptionRate.toFixed(1)}%`);

            if (encryptionRate === 100) {
                client.logger.debug('[ENCRYPTION_VALIDATION] All API keys are properly encrypted');
            } else if (migrationResult.migrationErrors === 0) {
                client.logger.debug('[ENCRYPTION_VALIDATION] All plaintext API keys successfully migrated to encryption');
            } else {
                client.logger.warn('[ENCRYPTION_VALIDATION] Some API keys could not be migrated - manual intervention may be required');
            }
        } else {
            client.logger.info('[ENCRYPTION_VALIDATION] No chatbot configurations found - encryption ready for new setups');
        }

        try {
            const testData = "test-api-key-encryption";
            const encrypted = EncryptionUtil.encrypt(testData);
            const decrypted = EncryptionUtil.decrypt(encrypted);

            if (decrypted === testData) {
                client.logger.debug('[ENCRYPTION_VALIDATION] Encryption/decryption test passed');
            } else {
                throw new Error('Decrypted data does not match original');
            }
        } catch (testError) {
            client.logger.error(`[ENCRYPTION_VALIDATION] Encryption test failed: ${testError}`);

            if (process.env.NODE_ENV !== 'development') {
                client.logger.error('[ENCRYPTION_VALIDATION] Critical encryption failure - stopping bot');
                process.exit(1);
            }
        }

        client.logger.success('[ENCRYPTION_VALIDATION] Encryption validation completed successfully');

    } catch (error) {
        client.logger.error(`[ENCRYPTION_VALIDATION] Error during encryption validation: ${error}`);

        if (process.env.NODE_ENV !== 'development') {
            client.logger.error('[ENCRYPTION_VALIDATION] Critical error during encryption validation - stopping bot');
            process.exit(1);
        }
    }
};