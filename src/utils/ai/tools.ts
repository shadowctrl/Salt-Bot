import discord from "discord.js";
import { OpenAIFunction } from "../../types";

/**
 * Creates a tool for creating tickets in a Discord server.
 * @param {discord.Client} client - The Discord client instance.
 * @param {Array<string>} categoryIds - An array of category IDs where tickets can be created.
 * @returns {Array<OpenAIFunction>} - An array containing the tool definition for creating tickets.
 * @throws {Error} - Throws an error if the category ID is not found in the client's channel cache.
 */
export const createTicketTool = (client: discord.Client, categoryIds: Array<string>): Array<OpenAIFunction> => {
    const categoryNames: Array<string> = [];

    categoryIds.forEach((categoryId) => {
        const category = client.channels.cache.get(categoryId) as discord.CategoryChannel;
        if (!category) throw new Error(`Category with ID ${categoryId} not found in client's channel cache`);
        if (category.type !== discord.ChannelType.GuildCategory) throw new Error(`Channel with ID ${categoryId} is not a category channel`);
        categoryNames.push(category.name);
    });

    return [{
        type: "function",
        function: {
            name: "create_ticket",
            description: "Create a new ticket for a user",
            parameters: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description: "The message to send to the user when creating the ticket."
                    },
                    ticket_category: {
                        type: "string",
                        description: "The ticket category to create the ticket in.",
                        enum: categoryNames
                    }
                },
                required: ["ticket_category"],
                additionalProperties: false
            }
        }
    }];
};