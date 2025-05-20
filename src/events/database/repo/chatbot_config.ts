import client from "../../../salt";
import { Repository, DataSource } from "typeorm";
import { ChatbotConfig } from "../entities/chatbot_config";

export class ChatbotConfigRepository {
    private configRepo: Repository<ChatbotConfig>;
    private dataSource: DataSource;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.configRepo = dataSource.getRepository(ChatbotConfig);
    }

    getConfig = async (guildId: string): Promise<ChatbotConfig | null> => {
        try {
            return await this.configRepo.findOne({
                where: { guildId }
            });
        } catch (error) {
            client.logger.error(`[CHATBOT_CONFIG_REPO] Error getting config: ${error}`);
            return null;
        }
    };

    createConfig = async (
        guildId: string,
        channelId: string,
        apiKey: string,
        baseUrl: string = "https://api.openai.com/v1",
        chatbotName: string = "AI Assistant",
        responseType: string = ""
    ): Promise<ChatbotConfig | null> => {
        try {
            const config = new ChatbotConfig();
            config.guildId = guildId;
            config.channelId = channelId;
            config.apiKey = apiKey;
            config.baseUrl = baseUrl;
            config.chatbotName = chatbotName;
            config.responseType = responseType;
            config.cooldown = 5; // Default cooldown
            config.enabled = true;

            return await this.configRepo.save(config);
        } catch (error) {
            client.logger.error(`[CHATBOT_CONFIG_REPO] Error creating config: ${error}`);
            return null;
        }
    };

    updateConfig = async (
        guildId: string,
        updates: Partial<ChatbotConfig>
    ): Promise<ChatbotConfig | null> => {
        try {
            const config = await this.getConfig(guildId);
            if (!config) return null;

            Object.assign(config, updates);

            return await this.configRepo.save(config);
        } catch (error) {
            client.logger.error(`[CHATBOT_CONFIG_REPO] Error updating config: ${error}`);
            return null;
        }
    };

    deleteConfig = async (guildId: string): Promise<boolean> => {
        try {
            const config = await this.getConfig(guildId);
            if (!config) return false;

            await this.configRepo.remove(config);
            return true;
        } catch (error) {
            client.logger.error(`[CHATBOT_CONFIG_REPO] Error deleting config: ${error}`);
            return false;
        }
    };
}