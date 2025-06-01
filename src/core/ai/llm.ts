import { OpenAI } from "openai";

import client from "../../salt";


/**
 * LLM class for interacting with OpenAI's API.
 */
export class LLM {
    private readonly openai_client: OpenAI;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;

    constructor(apiKey: string, baseUrl: string, maxRetries: number = 3, retryDelayMs: number = 1000) {
        this.openai_client = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey,
        });
        this.maxRetries = maxRetries;
        this.retryDelayMs = retryDelayMs;
    }

    /**
     * Invokes the LLM with the given messages and model.
     * @param {OpenAI.Chat.Completions.ChatCompletionMessageParam[]} messages - The messages to send to the LLM.
     * @param {string} model - The model to use for the LLM.
     * @param {object} options - Additional options for the API call.
     * @returns {Promise<OpenAI.Chat.Completions.ChatCompletion>} - The LLM's response.
     * @throws {Error} - Throws an error if the API request fails.
     */
    public async invoke(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        model: string,
        options?: Record<string, any>
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        let retries = 0;

        while (true) {
            try {
                const response = await this.openai_client.chat.completions.create({
                    model: model,
                    messages: messages,
                    ...(options || {})
                });

                if (!response) {
                    throw new Error("No response from LLM");
                }

                return response;
            } catch (error: any) {
                retries++;

                if (retries <= this.maxRetries &&
                    (error.status === 429 || error.status >= 500)) {
                    const delay = this.retryDelayMs * Math.pow(2, retries - 1);
                    client.logger.warn(`API request failed, retrying in ${delay}ms: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }
}