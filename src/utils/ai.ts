import { OpenAI } from "openai";
import discord from "discord.js";
import { DataSource } from "typeorm";
import { ChatHistoryRepository } from "../events/database/repo/chat_history";

/**
 * LLM class for interacting with OpenAI's API.
 */
class LLM {
    private readonly client: discord.Client;
    private readonly openai_client: OpenAI;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;

    constructor(apiKey: string, baseUrl: string, client: discord.Client, maxRetries: number = 3, retryDelayMs: number = 1000) {
        this.openai_client = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey,
        });
        this.client = client;
        this.maxRetries = maxRetries;
        this.retryDelayMs = retryDelayMs;
    }

    /**
     * Invokes the LLM with the given messages and model.
     * @param {OpenAI.Responses.EasyInputMessage[]} messages - The messages to send to the LLM.
     * @param {string} model - The model to use for the LLM.
     * @param {...any} args - Additional arguments for the LLM invocation.
     * @returns {Promise<OpenAI.Responses.Response>} - The response from the LLM.
     */
    public async invoke(messages: OpenAI.Responses.EasyInputMessage[], model: string, ...args: any): Promise<OpenAI.Responses.Response> {
        let retries = 0;

        while (true) {
            try {
                const response = await this.openai_client.responses.create({
                    model: model,
                    messages: messages,
                    ...args
                });

                if (!response || !response.status || response.status === "failed") {
                    throw new Error("Failed to get a valid response from the LLM.");
                }

                return response;
            } catch (error: any) {
                retries++;

                if (retries <= this.maxRetries &&
                    (error.status === 429 || error.status >= 500)) {
                    const delay = this.retryDelayMs * Math.pow(2, retries - 1);
                    console.warn(`API request failed, retrying in ${delay}ms: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }
}

/**
 * ChatHistory class for maintaining conversation history in PostgreSQL.
 */
class ChatHistory {
    private readonly repository: ChatHistoryRepository;
    private readonly maxHistoryLength: number;
    private readonly userId: string;
    private readonly guildId: string;

    /**
     * Creates a new ChatHistory instance.
     * @param {DataSource} dataSource - TypeORM DataSource for database operations.
     * @param {string} userId - The user's Discord ID.
     * @param {string} guildId - The guild's Discord ID.
     * @param {number} maxHistoryLength - Maximum number of messages to keep in history.
     */
    constructor(dataSource: DataSource, userId: string, guildId: string, maxHistoryLength: number = 50) {
        this.repository = new ChatHistoryRepository(dataSource);
        this.maxHistoryLength = maxHistoryLength;
        this.userId = userId;
        this.guildId = guildId;
    }

    /**
     * Adds a user message to the history.
     * @param {string} content - The user's message content.
     */
    public async addUserMessage(content: string): Promise<void> {
        await this.addMessage({ role: "user", content });
    }

    /**
     * Adds an assistant message to the history.
     * @param {string} content - The assistant's message content.
     */
    public async addAssistantMessage(content: string): Promise<void> {
        await this.addMessage({ role: "assistant", content });
    }

    /**
     * Adds a system message to the history.
     * @param {string} content - The system message content.
     */
    public async addSystemMessage(content: string): Promise<void> {
        await this.addMessage({ role: "system", content });
    }

    /**
     * Adds a message to the history.
     * @param {OpenAI.Responses.EasyInputMessage} message - The message to add.
     */
    private async addMessage(message: OpenAI.Responses.EasyInputMessage): Promise<void> {
        await this.repository.addMessage(
            this.guildId,
            this.userId,
            message.role,
            message.content as string
        );

        await this.repository.trimHistory(
            this.guildId,
            this.userId,
            this.maxHistoryLength
        );
    }

    /**
     * Gets the entire conversation history.
     * @returns {Promise<OpenAI.Responses.EasyInputMessage[]>} - The conversation history.
     */
    public async getHistory(): Promise<OpenAI.Responses.EasyInputMessage[]> {
        const entries = await this.repository.getHistory(this.guildId, this.userId);
        return this.repository.convertToOpenAIMessages(entries);
    }

    /**
     * Gets a window of the most recent messages.
     * @param {number} count - Number of messages to retrieve.
     * @returns {Promise<OpenAI.Responses.EasyInputMessage[]>} - The most recent messages.
     */
    public async getRecentMessages(count: number): Promise<OpenAI.Responses.EasyInputMessage[]> {
        const entries = await this.repository.getRecentMessages(this.guildId, this.userId, count);
        return this.repository.convertToOpenAIMessages(entries.reverse());
    }

    /**
     * Clears the conversation history.
     * @param {boolean} keepSystemMessages - Whether to keep system messages.
     */
    public async clearHistory(keepSystemMessages: boolean = true): Promise<void> {
        await this.repository.clearHistory(this.guildId, this.userId, keepSystemMessages);
    }

    /**
     * Gets the user ID associated with this chat history.
     * @returns {string} - The user ID.
     */
    public getUserId(): string {
        return this.userId;
    }

    /**
     * Gets the guild ID associated with this chat history.
     * @returns {string} - The guild ID.
     */
    public getGuildId(): string {
        return this.guildId;
    }
}

export { LLM, ChatHistory };