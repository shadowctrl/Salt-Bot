import { OpenAI } from "openai";
import discord from "discord.js";


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
 * ChatHistory class for maintaining conversation history.
 */
class ChatHistory {
    private history: OpenAI.Responses.EasyInputMessage[];
    private readonly maxHistoryLength: number;
    private readonly userId: string;

    /**
     * Creates a new ChatHistory instance.
     * @param {string} userId - The unique identifier for this chat history.
     * @param {number} maxHistoryLength - Maximum number of messages to keep in history.
     */
    constructor(userId: string, maxHistoryLength: number = 50) {
        this.history = [];
        this.maxHistoryLength = maxHistoryLength;
        this.userId = userId;
    }

    /**
     * Adds a user message to the history.
     * @param {string} content - The user's message content.
     */
    public addUserMessage(content: string): void {
        this.addMessage({ role: "user", content });
    }

    /**
     * Adds an assistant message to the history.
     * @param {string} content - The assistant's message content.
     */
    public addAssistantMessage(content: string): void {
        this.addMessage({ role: "assistant", content });
    }

    /**
     * Adds a system message to the history.
     * @param {string} content - The system message content.
     */
    public addSystemMessage(content: string): void {
        this.addMessage({ role: "system", content });
    }

    /**
     * Adds a message to the history.
     * @param {OpenAI.Responses.EasyInputMessage} message - The message to add.
     */
    private addMessage(message: OpenAI.Responses.EasyInputMessage): void {
        this.history.push(message);
        this.trimHistory();
    }

    /**
     * Trims the history to the maximum length.
     */
    private trimHistory(): void {
        if (this.history.length > this.maxHistoryLength) {
            const systemMessages = this.history.filter(msg => msg.role === "system");
            const nonSystemMessages = this.history
                .filter(msg => msg.role !== "system")
                .slice(-this.maxHistoryLength + systemMessages.length);

            this.history = [...systemMessages, ...nonSystemMessages];
        }
    }

    /**
     * Gets the entire conversation history.
     * @returns {OpenAI.Responses.EasyInputMessage[]} - The conversation history.
     */
    public getHistory(): OpenAI.Responses.EasyInputMessage[] {
        return [...this.history];
    }

    /**
     * Gets a window of the most recent messages.
     * @param {number} count - Number of messages to retrieve.
     * @returns {OpenAI.Responses.EasyInputMessage[]} - The most recent messages.
     */
    public getRecentMessages(count: number): OpenAI.Responses.EasyInputMessage[] {
        return this.history.slice(-count);
    }

    /**
     * Clears the conversation history.
     * @param {boolean} keepSystemMessages - Whether to keep system messages.
     */
    public clearHistory(keepSystemMessages: boolean = true): void {
        if (keepSystemMessages) {
            this.history = this.history.filter(msg => msg.role === "system");
        } else {
            this.history = [];
        }
    }

    /**
     * Gets the user ID associated with this chat history.
     * @returns {string} - The user ID.
     */
    public getUserId(): string {
        return this.userId;
    }
}

export { LLM, ChatHistory };