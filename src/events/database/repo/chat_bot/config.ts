import { Repository, DataSource } from 'typeorm';

import client from '../../../../salt';
import { EncryptionUtil } from '../../../../utils/encryption';
import { ChatbotConfig } from '../../entities/chat_bot';

export class ChatbotConfigRepository {
	private configRepo: Repository<ChatbotConfig>;

	constructor(dataSource: DataSource) {
		this.configRepo = dataSource.getRepository(ChatbotConfig);
	}

	/**
	 * Get chatbot configuration with decrypted API key
	 * @param guildId - Discord guild ID
	 * @returns Chatbot configuration with decrypted API key or null
	 */
	getConfig = async (guildId: string): Promise<ChatbotConfig | null> => {
		try {
			const config = await this.configRepo.findOne({ where: { guildId } });
			if (!config) return null;
			try {
				config.apiKey = EncryptionUtil.decrypt(config.apiKey);
			} catch (decryptionError) {
				client.logger.error(`[CHATBOT_CONFIG_REPO] Failed to decrypt API key for guild ${guildId}: ${decryptionError}`);
				if (EncryptionUtil.isEncrypted(config.apiKey)) {
					throw new Error('Failed to decrypt API key - encryption key may have changed');
				} else {
					client.logger.warn(`[CHATBOT_CONFIG_REPO] API key for guild ${guildId} appears to be in plaintext - will re-encrypt on next update`);
				}
			}
			return config;
		} catch (error) {
			client.logger.error(`[CHATBOT_CONFIG_REPO] Error getting config: ${error}`);
			return null;
		}
	};

	/**
	 * Create chatbot configuration with encrypted API key
	 * @param guildId - Discord guild ID
	 * @param channelId - Discord channel ID
	 * @param apiKey - Plaintext API key (will be encrypted)
	 * @param modelName - AI model name
	 * @param baseUrl - API base URL
	 * @param chatbotName - Chatbot display name
	 * @param responseType - Response personality/type
	 * @returns Created chatbot configuration with decrypted API key or null
	 */
	createConfig = async (guildId: string, channelId: string, apiKey: string, modelName: string, baseUrl: string = 'https://api.openai.com/v1', chatbotName: string = 'Salt', responseType: string = ''): Promise<ChatbotConfig | null> => {
		try {
			if (!apiKey || apiKey.trim().length === 0) throw new Error('API key cannot be empty');

			const encryptedApiKey = EncryptionUtil.encrypt(apiKey.trim());
			const config = new ChatbotConfig();
			config.guildId = guildId;
			config.channelId = channelId;
			config.apiKey = encryptedApiKey;
			config.modelName = modelName;
			config.baseUrl = baseUrl;
			config.chatbotName = chatbotName;
			config.responseType = responseType;
			config.cooldown = 5;
			config.enabled = true;
			const savedConfig = await this.configRepo.save(config);
			try {
				savedConfig.apiKey = EncryptionUtil.decrypt(savedConfig.apiKey);
			} catch (decryptionError) {
				client.logger.error(`[CHATBOT_CONFIG_REPO] Failed to decrypt API key after creation for guild ${guildId}: ${decryptionError}`);
				throw new Error('Failed to decrypt API key after creation');
			}
			client.logger.info(`[CHATBOT_CONFIG_REPO] Created encrypted chatbot config for guild ${guildId}`);
			return savedConfig;
		} catch (error) {
			client.logger.error(`[CHATBOT_CONFIG_REPO] Error creating config: ${error}`);
			return null;
		}
	};

	/**
	 * Update chatbot configuration with API key encryption handling
	 * @param guildId - Discord guild ID
	 * @param updates - Partial configuration updates
	 * @returns Updated chatbot configuration with decrypted API key or null
	 */
	updateConfig = async (guildId: string, updates: Partial<ChatbotConfig>): Promise<ChatbotConfig | null> => {
		try {
			const config = await this.configRepo.findOne({ where: { guildId } });
			if (!config) return null;
			if (updates.apiKey !== undefined) {
				if (!updates.apiKey || updates.apiKey.trim().length === 0) throw new Error('API key cannot be empty');
				if (!EncryptionUtil.isEncrypted(updates.apiKey)) {
					updates.apiKey = EncryptionUtil.encrypt(updates.apiKey.trim());
					client.logger.debug(`[CHATBOT_CONFIG_REPO] Encrypted new API key for guild ${guildId}`);
				}
			} else if (!EncryptionUtil.isEncrypted(config.apiKey)) {
				config.apiKey = EncryptionUtil.encrypt(config.apiKey);
				client.logger.info(`[CHATBOT_CONFIG_REPO] Encrypted existing plaintext API key for guild ${guildId}`);
			}

			Object.assign(config, updates);
			const savedConfig = await this.configRepo.save(config);
			try {
				savedConfig.apiKey = EncryptionUtil.decrypt(savedConfig.apiKey);
			} catch (decryptionError) {
				client.logger.error(`[CHATBOT_CONFIG_REPO] Failed to decrypt API key after update for guild ${guildId}: ${decryptionError}`);
				throw new Error('Failed to decrypt API key after update');
			}
			return savedConfig;
		} catch (error) {
			client.logger.error(`[CHATBOT_CONFIG_REPO] Error updating config: ${error}`);
			return null;
		}
	};

	/**
	 * Delete chatbot configuration
	 * @param guildId - Discord guild ID
	 * @returns True if deletion was successful, false otherwise
	 */
	deleteConfig = async (guildId: string): Promise<boolean> => {
		try {
			const config = await this.configRepo.findOne({ where: { guildId } });
			if (!config) return false;
			await this.configRepo.remove(config);
			client.logger.info(`[CHATBOT_CONFIG_REPO] Deleted chatbot config for guild ${guildId}`);
			return true;
		} catch (error) {
			client.logger.error(`[CHATBOT_CONFIG_REPO] Error deleting config: ${error}`);
			return false;
		}
	};

	/**
	 * Validate encryption setup and re-encrypt any plaintext API keys
	 * This method can be called during bot startup to ensure all API keys are encrypted
	 * @returns Object with validation results
	 */
	validateAndMigrateEncryption = async (): Promise<{ totalConfigs: number; encryptedConfigs: number; plaintextConfigs: number; migrationErrors: number; encryptionValid: boolean }> => {
		try {
			const keyValidation = EncryptionUtil.validateMasterKey();
			if (!keyValidation.isValid) {
				client.logger.error(`[CHATBOT_CONFIG_REPO] Encryption validation failed: ${keyValidation.message}`);
				return { totalConfigs: 0, encryptedConfigs: 0, plaintextConfigs: 0, migrationErrors: 0, encryptionValid: false };
			}

			const allConfigs = await this.configRepo.find();
			let encryptedCount = 0;
			let plaintextCount = 0;
			let migrationErrors = 0;

			for (const config of allConfigs) {
				if (EncryptionUtil.isEncrypted(config.apiKey)) {
					encryptedCount++;
				} else {
					plaintextCount++;
					try {
						const encryptedKey = EncryptionUtil.encrypt(config.apiKey);
						config.apiKey = encryptedKey;
						await this.configRepo.save(config);
						encryptedCount++;
						plaintextCount--;
						client.logger.info(`[CHATBOT_CONFIG_REPO] Migrated plaintext API key to encrypted for guild ${config.guildId}`);
					} catch (encryptionError) {
						migrationErrors++;
						client.logger.error(`[CHATBOT_CONFIG_REPO] Failed to encrypt API key for guild ${config.guildId}: ${encryptionError}`);
					}
				}
			}

			const result = { totalConfigs: allConfigs.length, encryptedConfigs: encryptedCount, plaintextConfigs: plaintextCount, migrationErrors: migrationErrors, encryptionValid: keyValidation.isValid };
			client.logger.debug(`[CHATBOT_CONFIG_REPO] Encryption validation complete: ${JSON.stringify(result)}`);
			return result;
		} catch (error) {
			client.logger.error(`[CHATBOT_CONFIG_REPO] Error during encryption validation: ${error}`);
			return { totalConfigs: 0, encryptedConfigs: 0, plaintextConfigs: 0, migrationErrors: 1, encryptionValid: false };
		}
	};

	/**
	 * Get configuration by channel ID with decrypted API key
	 * @param channelId - Discord channel ID
	 * @returns Chatbot configuration with decrypted API key or null
	 */
	getConfigByChannelId = async (channelId: string): Promise<ChatbotConfig | null> => {
		try {
			const config = await this.configRepo.findOne({ where: { channelId } });
			if (!config) return null;
			try {
				config.apiKey = EncryptionUtil.decrypt(config.apiKey);
			} catch (decryptionError) {
				client.logger.error(`[CHATBOT_CONFIG_REPO] Failed to decrypt API key for channel ${channelId}: ${decryptionError}`);
				if (EncryptionUtil.isEncrypted(config.apiKey)) {
					throw new Error('Failed to decrypt API key - encryption key may have changed');
				} else {
					client.logger.warn(`[CHATBOT_CONFIG_REPO] API key for channel ${channelId} appears to be in plaintext`);
				}
			}
			return config;
		} catch (error) {
			client.logger.error(`[CHATBOT_CONFIG_REPO] Error getting config by channel ID: ${error}`);
			return null;
		}
	};
}
