import RAG from "./rag";
import { DataSource } from "typeorm";
import { LLM, Embedding } from "./llm";
import ChatHistory from "./chat_history";
import { ChatbotConfig } from "../../events/database/entities/chatbot_config";
import { RagRepository } from "../../events/database/repo/rag_data";
import client from "../../salt";

/**
 * Service class for handling chatbot interactions with RAG integration
 * Manages message processing, RAG context retrieval, and LLM responses
 */
export class ChatbotService {
    private ragRepo: RagRepository;
    private dataSource: DataSource;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.ragRepo = new RagRepository(dataSource);
    }

    /**
     * Get chatbot configuration by channel ID
     * @param channelId - Discord channel ID
     * @returns Chatbot configuration or null if not found
     */
    public getConfigByChannelId = async (channelId: string): Promise<ChatbotConfig | null> => {
        try {
            const configs = await this.dataSource.getRepository(ChatbotConfig).find();
            return configs.find(config => config.channelId === channelId) || null;
        } catch (error) {
            client.logger.error(`[CHATBOT_SERVICE] Error finding config by channel ID: ${error}`);
            return null;
        }
    };

    /**
     * Search for relevant context from RAG data
     * @param query - User's query
     * @param guildId - Discord guild ID
     * @returns Relevant context or null if no RAG data available
     */
    private searchRagContext = async (query: string, guildId: string): Promise<string | null> => {
        try {
            const hasRagData = await this.ragRepo.hasRagData(guildId);
            if (!hasRagData) {
                return null;
            }

            const embedding = new Embedding();
            const rag = new RAG(embedding);
            const queryEmbedding = await rag.getQueryEmbedding(query);

            const similarChunks = await this.ragRepo.searchSimilarChunks(
                guildId,
                queryEmbedding,
                5
            );

            if (similarChunks.length === 0) {
                return null;
            }

            const context = similarChunks
                .map((chunk, index) => `[Context ${index + 1}]\n${chunk.content}`)
                .join('\n\n');

            return context;
        } catch (error) {
            client.logger.error(`[CHATBOT_SERVICE] Error searching RAG context: ${error}`);
            return null;
        }
    };

    /**
     * Build the system prompt with optional RAG context
     * @param config - Chatbot configuration
     * @param ragContext - RAG context if available
     * @returns System prompt string
     */
    private buildSystemPrompt = (config: ChatbotConfig, ragContext: string | null): string => {
        let systemPrompt = `You are ${config.chatbotName}, an AI assistant in a Discord server. `;

        if (config.responseType && config.responseType.trim().length > 0) {
            systemPrompt += `Your personality and response style: ${config.responseType}. `;
        }

        systemPrompt += `
Guidelines:
- Be helpful, informative, and engaging
- Keep responses concise but thorough
- Use Discord-friendly formatting when appropriate
- If you don't know something, say so honestly
- Stay in character as ${config.chatbotName}`;

        if (ragContext) {
            systemPrompt += `

You have access to specific knowledge about this server/topic. Use the following context to answer questions when relevant:

${ragContext}

When using this context:
- Reference the information naturally in your response
- If the context is relevant, use it to provide accurate, detailed answers
- If the context doesn't relate to the question, you can still provide general help
- Don't mention that you're using "context" or "knowledge base" explicitly`;
        }

        return systemPrompt;
    };

    /**
     * Process a user message and generate a response
     * @param userMessage - The user's message content
     * @param userId - Discord user ID
     * @param config - Chatbot configuration
     * @returns Generated response or null if failed
     */
    public processMessage = async (
        userMessage: string,
        userId: string,
        config: ChatbotConfig
    ): Promise<string | null> => {
        try {
            const llm = new LLM(config.apiKey, config.baseUrl);

            const chatHistory = new ChatHistory(
                this.dataSource,
                userId,
                config.guildId,
                20 // Keep last 20 messages
            );

            const ragContext = await this.searchRagContext(userMessage, config.guildId);
            const systemPrompt = this.buildSystemPrompt(config, ragContext);
            const history = await chatHistory.getHistory();
            const filteredHistory = history.filter(msg => msg.role !== 'system');

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                ...filteredHistory,
                { role: 'user' as const, content: userMessage }
            ];

            await chatHistory.addUserMessage(userMessage);

            const response = await llm.invoke(messages, config.modelName, {
                max_tokens: 2000,
                temperature: 0.7
            });

            const assistantMessage = response.choices[0]?.message?.content;

            if (!assistantMessage) {
                client.logger.error('[CHATBOT_SERVICE] No response content from LLM');
                return null;
            }

            await chatHistory.addAssistantMessage(assistantMessage);

            return assistantMessage;

        } catch (error) {
            client.logger.error(`[CHATBOT_SERVICE] Error processing message: ${error}`);
            return null;
        }
    };

    /**
     * Split long responses into Discord-friendly chunks
     * @param response - The response to split
     * @returns Array of response chunks
     */
    public splitResponse = (response: string): string[] => {
        const maxLength = 2000; // Discord message limit
        const chunks: string[] = [];

        if (response.length <= maxLength) {
            return [response];
        }

        const paragraphs = response.split('\n\n');
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            if ((currentChunk + paragraph).length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }

                if (paragraph.length > maxLength) {
                    const sentences = paragraph.split('. ');
                    for (const sentence of sentences) {
                        if ((currentChunk + sentence + '. ').length > maxLength) {
                            if (currentChunk) {
                                chunks.push(currentChunk.trim());
                                currentChunk = '';
                            }
                            if (sentence.length > maxLength) {
                                const words = sentence.split(' ');
                                for (const word of words) {
                                    if ((currentChunk + word + ' ').length > maxLength) {
                                        if (currentChunk) {
                                            chunks.push(currentChunk.trim());
                                            currentChunk = '';
                                        }
                                    }
                                    currentChunk += word + ' ';
                                }
                            } else {
                                currentChunk = sentence + '. ';
                            }
                        } else {
                            currentChunk += sentence + '. ';
                        }
                    }
                } else {
                    currentChunk = paragraph + '\n\n';
                }
            } else {
                currentChunk += paragraph + '\n\n';
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    };

    /**
     * Clear chat history for a user
     * @param userId - Discord user ID
     * @param guildId - Discord guild ID
     * @returns True if successful, false otherwise
     */
    public clearUserHistory = async (userId: string, guildId: string): Promise<boolean> => {
        try {
            const chatHistory = new ChatHistory(this.dataSource, userId, guildId);
            await chatHistory.clearHistory(false);
            return true;
        } catch (error) {
            client.logger.error(`[CHATBOT_SERVICE] Error clearing user history: ${error}`);
            return false;
        }
    };
}