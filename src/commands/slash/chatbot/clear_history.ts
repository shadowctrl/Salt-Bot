import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { ChatbotService } from "../../../utils/ai";

export const handleClearHistory = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    try {
        if (!(client as any).dataSource) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Database connection is not available.")]
            });
            return;
        }

        const chatbotService = new ChatbotService((client as any).dataSource);

        const config = await chatbotService.getConfigByChannelId(interaction.channelId);
        if (!config || !config.enabled) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("This command can only be used in a chatbot channel.")
                ]
            });
            return;
        }

        const success = await chatbotService.clearUserHistory(
            interaction.user.id,
            interaction.guildId!
        );

        if (success) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).success("Your chat history has been cleared!")
                        .setDescription(`${config.chatbotName} will no longer remember your previous conversations.`)
                ]
            });
        } else {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Failed to clear your chat history.")
                        .setDescription("Please try again later or contact an administrator.")
                ]
            });
        }

        client.logger.info(`[CHATBOT_CLEAR] ${interaction.user.tag} cleared their chat history in guild ${interaction.guildId}`);
    } catch (error) {
        client.logger.error(`[CHATBOT_CLEAR] Error clearing chat history: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while clearing your chat history.")]
        });
    }
};