import discord from "discord.js";

import { EmbedTemplate } from "../../../core/embed/template";
import { ChatbotConfigRepository } from "../../../events/database/repo/chat_bot";


export const handleInfo = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    chatbotRepo: ChatbotConfigRepository
): Promise<void> => {
    try {
        const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
        if (!existingConfig) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("No chatbot is set up for this server.")
                        .setDescription("Use `/chatbot setup` to create a new chatbot configuration.")
                ]
            });
            return;
        }

        let channelInfo = "Unknown (channel may have been deleted)";
        try {
            const channel = await client.channels.fetch(existingConfig.channelId);
            if (channel) {
                channelInfo = `<#${channel.id}>`;
            }
        } catch (error) {
            client.logger.warn(`[CHATBOT_INFO] Could not fetch channel: ${error}`);
        }

        const createdAt = new Date(existingConfig.createdAt);
        const createdTimestamp = Math.floor(createdAt.getTime() / 1000);

        const infoEmbed = new discord.EmbedBuilder()
            .setTitle("Chatbot Information")
            .setDescription(`Information about the chatbot in ${channelInfo}`)
            .addFields(
                { name: "Name", value: existingConfig.chatbotName, inline: true },
                { name: "Model", value: existingConfig.modelName, inline: true },
                { name: "Enabled", value: existingConfig.enabled ? "Yes" : "No", inline: true },
                { name: "Cooldown", value: `${existingConfig.cooldown} seconds`, inline: true },
                { name: "API", value: existingConfig.baseUrl, inline: true },
                { name: "API Key", value: "••••••••" + existingConfig.apiKey.slice(-4), inline: true },
                { name: "Created", value: `<t:${createdTimestamp}:R>`, inline: true }
            )
            .setColor("Blue")
            .setTimestamp();

        if (existingConfig.responseType) {
            infoEmbed.addFields({
                name: "Response Type",
                value: existingConfig.responseType.length > 1024 ?
                    existingConfig.responseType.substring(0, 1021) + "..." :
                    existingConfig.responseType,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [infoEmbed] });
        return;
    } catch (error) {
        client.logger.error(`[CHATBOT_INFO] Error getting chatbot info: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while getting chatbot information.")]
        });
    }
};