import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

/**
 * Helper function to deploy the ticket system
 */
export const deployTicketSystem = async (
    interaction: discord.MessageComponentInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository,
    ticketChannel: discord.TextChannel
): Promise<void> => {
    try {
        // Show loading state
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("⏳ Deploying Ticket System")
                    .setDescription("Please wait while we deploy your ticket system...")
                    .setColor("Blue")
            ],
            components: []
        }).catch(() => {
            client.logger.debug("[SETUP] Failed to update loading state - continuing with deployment");
        });

        // Get the button configuration
        const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);

        if (!buttonConfig) {
            throw new Error("Button configuration not found");
        }

        // Create the embed
        const ticketEmbed = new discord.EmbedBuilder()
            .setTitle(buttonConfig.embedTitle || "Need Help?")
            .setDescription(buttonConfig.embedDescription || "Click the button below to create a ticket")
            .setColor((buttonConfig.embedColor || "#5865F2") as discord.ColorResolvable)
            .setFooter({ text: "Powered by Salt Bot", iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

        // Get button style
        let style = discord.ButtonStyle.Primary;
        switch (buttonConfig.style?.toUpperCase()) {
            case "SECONDARY":
                style = discord.ButtonStyle.Secondary;
                break;
            case "SUCCESS":
                style = discord.ButtonStyle.Success;
                break;
            case "DANGER":
                style = discord.ButtonStyle.Danger;
                break;
        }

        // Create the button row
        const buttonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonConfig.label)
                    .setEmoji(buttonConfig.emoji)
                    .setStyle(style)
            );

        // Send the panel
        const panelMessage = await ticketChannel.send({
            embeds: [ticketEmbed],
            components: [buttonRow]
        });

        // Update the message ID in the database
        await ticketRepo.configureTicketButton(interaction.guildId!, {
            messageId: panelMessage.id
        });

        // If using categories, update select menu config too
        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);
        if (categories.length > 1) {
            await ticketRepo.configureSelectMenu(interaction.guildId!, {
                messageId: panelMessage.id
            });
        }

        // Send confirmation message
        try {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("🎉 Ticket System Deployed")
                        .setDescription(`Your ticket system has been deployed in ${ticketChannel}!\n\nUsers can now create tickets by clicking the button.`)
                        .setColor("Green")
                        .addFields({
                            name: "Customization",
                            value: "You can customize your ticket system further with `/ticket config`"
                        })
                        .setTimestamp()
                ],
                components: []
            });
        } catch (editError) {
            client.logger.warn(`[SETUP] Failed to edit reply after deployment: ${editError}`);
            // Try using followUp as a fallback
            try {
                await interaction.message.reply({
                    embeds: [
                        new EmbedTemplate(client).success("🎉 Ticket System Deployed!")
                            .setDescription(`The ticket panel has been created in ${ticketChannel}.`)
                    ]
                });
            } catch (replyError) {
                client.logger.error(`[SETUP] Failed to send followup after deployment: ${replyError}`);
            }
        }
    } catch (error) {
        client.logger.error(`[SETUP] Error deploying ticket system: ${error}`);

        // Try to update the interaction if possible
        try {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("An error occurred while deploying the ticket system.")],
                components: []
            });
        } catch (editError) {
            client.logger.debug(`[SETUP] Failed to edit reply with error: ${editError}`);
            // Try followUp as fallback
            try {
                await interaction.message.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while deploying the ticket system.")]
                });
            } catch (replyError) {
                client.logger.error(`[SETUP] Failed to send followup error: ${replyError}`);
            }
        }
    }
};