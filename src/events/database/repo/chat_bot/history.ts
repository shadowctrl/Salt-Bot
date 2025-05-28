import { OpenAI } from "openai";
import { Repository, DataSource, Not } from "typeorm";

import client from "../../../../salt";
import { ChatHistoryEntry } from "../../entities/chat_bot";


/**
 * Repository class for managing chat history in PostgreSQL
 */
export class ChatHistoryRepository {
    private historyRepo: Repository<ChatHistoryEntry>;

    /**
     * Creates a new ChatHistoryRepository instance
     * @param dataSource - TypeORM DataSource connection
     */
    constructor(dataSource: DataSource) {
        this.historyRepo = dataSource.getRepository(ChatHistoryEntry);
    }

    /**
     * Adds a message to the chat history
     * @param guildId - Discord guild ID
     * @param userId - Discord user ID
     * @param role - Message role (system, user, or assistant)
     * @param content - Message content
     * @returns The created chat history entry or null if creation failed
     */
    async addMessage(
        guildId: string,
        userId: string,
        role: string,
        content: string
    ): Promise<ChatHistoryEntry | null> {
        try {
            const entry = new ChatHistoryEntry();
            entry.guildId = guildId;
            entry.userId = userId;
            entry.role = role;
            entry.content = content;

            return await this.historyRepo.save(entry);
        } catch (error) {
            client.logger.error(`[CHAT_HISTORY_REPO] Error adding message: ${error}`);
            return null;
        }
    }

    /**
     * Gets the conversation history for a user in a guild
     * @param guildId - Discord guild ID
     * @param userId - Discord user ID
     * @returns Array of message entries
     */
    async getHistory(guildId: string, userId: string): Promise<ChatHistoryEntry[]> {
        try {
            return await this.historyRepo.find({
                where: {
                    guildId,
                    userId
                },
                order: {
                    createdAt: "ASC"
                }
            });
        } catch (error) {
            client.logger.error(`[CHAT_HISTORY_REPO] Error getting history: ${error}`);
            return [];
        }
    }

    /**
     * Gets the most recent messages for a user in a guild
     * @param guildId - Discord guild ID
     * @param userId - Discord user ID
     * @param count - Number of messages to retrieve
     * @returns Array of the most recent message entries
     */
    async getRecentMessages(guildId: string, userId: string, count: number): Promise<ChatHistoryEntry[]> {
        try {
            return await this.historyRepo.find({
                where: {
                    guildId,
                    userId
                },
                order: {
                    createdAt: "DESC"
                },
                take: count
            });
        } catch (error) {
            client.logger.error(`[CHAT_HISTORY_REPO] Error getting recent messages: ${error}`);
            return [];
        }
    }

    /**
     * Trims the history to not exceed the maximum length
     * @param guildId - Discord guild ID
     * @param userId - Discord user ID
     * @param maxLength - Maximum number of messages to keep
     */
    async trimHistory(guildId: string, userId: string, maxLength: number): Promise<void> {
        try {
            const nonSystemCount = await this.historyRepo.count({
                where: {
                    guildId,
                    userId,
                    role: Not("system")
                }
            });
            const systemCount = await this.historyRepo.count({
                where: {
                    guildId,
                    userId,
                    role: "system"
                }
            });

            const nonSystemAllowed = maxLength - systemCount;

            if (nonSystemCount > nonSystemAllowed && nonSystemAllowed >= 0) {
                const toDelete = nonSystemCount - nonSystemAllowed;
                const oldestEntries = await this.historyRepo.find({
                    where: {
                        guildId,
                        userId,
                        role: Not("system")
                    },
                    order: {
                        createdAt: "ASC"
                    },
                    take: toDelete
                });

                if (oldestEntries.length > 0) {
                    const idsToDelete = oldestEntries.map(entry => entry.id);
                    await this.historyRepo.delete(idsToDelete);
                }
            }
        } catch (error) {
            client.logger.error(`[CHAT_HISTORY_REPO] Error trimming history: ${error}`);
        }
    }

    /**
     * Clears the conversation history
     * @param guildId - Discord guild ID
     * @param userId - Discord user ID
     * @param keepSystemMessages - Whether to keep system messages
     * @returns True if successful, false otherwise
     */
    async clearHistory(guildId: string, userId: string, keepSystemMessages: boolean = true): Promise<boolean> {
        try {
            if (keepSystemMessages) {
                await this.historyRepo.delete({
                    guildId,
                    userId,
                    role: Not("system")
                });
            } else {
                await this.historyRepo.delete({
                    guildId,
                    userId
                });
            }
            return true;
        } catch (error) {
            client.logger.error(`[CHAT_HISTORY_REPO] Error clearing history: ${error}`);
            return false;
        }
    }

    /**
     * Converts chat history entries to OpenAI message format
     * @param entries - Chat history entries
     * @returns OpenAI format messages
     */
    convertToOpenAIMessages(entries: ChatHistoryEntry[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return entries.map(entry => ({
            role: entry.role as "system" | "user" | "assistant",
            content: entry.content
        }));
    }
}