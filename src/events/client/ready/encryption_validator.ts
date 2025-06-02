import discord from "discord.js";

import { BotEvent } from "../../../types";
import { EncryptionUtil } from "../../../utils/encryption";
import { ChatbotConfigRepository } from "../../database/repo/chat_bot";


/**
 * Validates encryption setup and migrates any existing plaintext API keys on bot startup
 */
const event: BotEvent = {
    name: discord.Events.ClientReady,
    once: true,
    execute: async (client: discord.Client): Promise<void> => {
        try {
            if (!(client as any).dataSource) {
                client.logger.warn('[ENCRYPTION_VALIDATION] Database not available, skipping encryption validation');
                return;
            }

            client.logger.info('[ENCRYPTION_VALIDATION] Starting encryption validation and migration...');

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
                client.logger.success('[ENCRYPTION_VALIDATION] Master encryption key validation passed');

                if (keyValidation.recommendations.length > 0) {
                    client.logger.warn('[ENCRYPTION_VALIDATION] Encryption key recommendations:');
                    keyValidation.recommendations.forEach(rec => {
                        client.logger.warn(`[ENCRYPTION_VALIDATION] - ${rec}`);
                    });
                }
            }

            const chatbotRepo = new ChatbotConfigRepository((client as any).dataSource);
            const migrationResult = await chatbotRepo.validateAndMigrateEncryption();

            client.logger.info(`[ENCRYPTION_VALIDATION] Migration completed:`);
            client.logger.info(`[ENCRYPTION_VALIDATION] - Total configurations: ${migrationResult.totalConfigs}`);
            client.logger.info(`[ENCRYPTION_VALIDATION] - Encrypted configurations: ${migrationResult.encryptedConfigs}`);
            client.logger.info(`[ENCRYPTION_VALIDATION] - Plaintext configurations: ${migrationResult.plaintextConfigs}`);

            if (migrationResult.migrationErrors > 0) {
                client.logger.error(`[ENCRYPTION_VALIDATION] - Migration errors: ${migrationResult.migrationErrors}`);
            }

            if (migrationResult.totalConfigs > 0) {
                const encryptionRate = (migrationResult.encryptedConfigs / migrationResult.totalConfigs) * 100;
                client.logger.info(`[ENCRYPTION_VALIDATION] - Encryption rate: ${encryptionRate.toFixed(1)}%`);

                if (encryptionRate === 100) {
                    client.logger.success('[ENCRYPTION_VALIDATION] All API keys are properly encrypted');
                } else if (migrationResult.migrationErrors === 0) {
                    client.logger.success('[ENCRYPTION_VALIDATION] All plaintext API keys successfully migrated to encryption');
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
                    client.logger.success('[ENCRYPTION_VALIDATION] Encryption/decryption test passed');
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
    }
};

export default event;