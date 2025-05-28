import discord from "discord.js";

import { EmbedTemplate } from "../../../core/embed/template";
import { ChatbotConfigRepository } from "../../../events/database/repo/chat_bot";


export const handleDelete = async (
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
                ]
            });
            return;
        }

        const confirmEmbed = new discord.EmbedBuilder()
            .setTitle("⚠️ Delete Chatbot")
            .setDescription(
                "Are you sure you want to delete the chatbot configuration?\n\n" +
                `This will remove the chatbot from <#${existingConfig.channelId}> and delete all related settings.\n\n` +
                "Type `confirm` to proceed or `cancel` to abort."
            )
            .setColor("Red");

        await interaction.editReply({ embeds: [confirmEmbed] });

        const channel = interaction.channel as discord.TextChannel;
        if (!channel) return;

        try {
            const collected = await channel.awaitMessages({
                filter: (m) => m.author.id === interaction.user.id,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            try {
                await collected.first()?.delete();
            } catch (err) {
                client.logger.debug(`[CHATBOT_DELETE] Could not delete message: ${err}`);
            }

            const response = collected.first()?.content.trim().toLowerCase();

            if (response === "confirm") {
                const deleted = await chatbotRepo.deleteConfig(interaction.guildId!);

                if (!deleted) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Failed to delete chatbot configuration.")]
                    });
                    return;
                }

                try {
                    const botChannel = await client.channels.fetch(existingConfig.channelId) as discord.TextChannel;
                    if (botChannel && botChannel.isTextBased()) {
                        await botChannel.send({
                            embeds: [
                                new discord.EmbedBuilder()
                                    .setTitle("Chatbot Deactivated")
                                    .setDescription("This channel is no longer configured as a chatbot channel.")
                                    .setColor("Red")
                                    .setTimestamp()
                            ]
                        });
                    }
                } catch (error) {
                    client.logger.warn(`[CHATBOT_DELETE] Could not send deactivation message: ${error}`);
                }

                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).success("Chatbot configuration deleted successfully!")
                            .setDescription("The chatbot has been deactivated and all settings have been removed.")
                    ]
                });
                return;
            } else {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).info("Deletion cancelled.")]
                });
                return;
            }
        } catch (error) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).info("Deletion timed out. Operation cancelled.")]
            });
            return;
        }
    } catch (error) {
        client.logger.error(`[CHATBOT_DELETE] Error deleting chatbot: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while deleting the chatbot.")]
        });
    }
};