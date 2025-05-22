import discord from "discord.js";
import { BotEvent } from "../../../types";
import { ChatbotService } from "../../../utils/ai";

const event: BotEvent = {
    name: discord.Events.MessageCreate,
    execute: async (message: discord.Message, client: discord.Client): Promise<void> => {
        try {
            if (message.author.bot || !message.guild) return;

            if (!(client as any).dataSource) {
                client.logger.debug("[CHATBOT] Database connection not available");
                return;
            }

            const chatbotService = new ChatbotService((client as any).dataSource);
            const config = await chatbotService.getConfigByChannelId(message.channelId);
            if (!config || !config.enabled) {
                return;
            }

            if ("sendTyping" in message.channel && typeof message.channel.sendTyping === "function") {
                await message.channel.sendTyping();
            }

            const response = await chatbotService.processMessage(
                message.content,
                message.author.id,
                config
            );

            if (response) {
                const chunks = chatbotService.splitResponse(response);

                for (const chunk of chunks) {
                    await message.reply({
                        content: chunk,
                        allowedMentions: { repliedUser: false }
                    });

                    if (chunks.length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else {
                await message.reply({
                    content: "I'm sorry, I couldn't process your message right now. Please try again later.",
                    allowedMentions: { repliedUser: false }
                });
            }

        } catch (error) {
            client.logger.error(`[CHATBOT] Error processing message: ${error}`);

            try {
                await message.reply({
                    content: "I encountered an error while processing your message. Please try again later.",
                    allowedMentions: { repliedUser: false }
                });
            } catch (replyError) {
                client.logger.error(`[CHATBOT] Failed to send error message: ${replyError}`);
            }
        }
    }
};

export default event;