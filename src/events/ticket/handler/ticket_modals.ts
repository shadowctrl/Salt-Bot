import discord from "discord.js";
import { BotEvent } from "../../../types";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { EmbedTemplate } from "../../../utils/embed_template";
import { createAndSendTranscript } from '../../../utils/transcript';

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        // Only handle modal submissions
        if (!interaction.isModalSubmit()) return;

        try {
            // Check if dataSource is initialized
            if (!(client as any).dataSource) {
                client.logger.error("[TICKET_MODAL] Database connection is not available");
                return;
            }

            // Handle ticket close modal
            if (interaction.customId === "ticket_close_modal") {
                await handleTicketCloseModal(interaction, client);
            }
        } catch (error) {
            client.logger.error(`[TICKET_MODAL] Error handling modal submission: ${error}`);

            // Only try to respond if the interaction hasn't been acknowledged
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                } catch (replyError) {
                    client.logger.error(`[TICKET_MODAL] Error sending error response: ${replyError}`);
                }
            }
        }
    }
};

/**
 * Handle the ticket close modal submission
 */
const handleTicketCloseModal = async (
    interaction: discord.ModalSubmitInteraction,
    client: discord.Client
) => {
    try {
        // First check if the modal is valid before deferring
        const ticketRepo = new TicketRepository((client as any).dataSource);

        // Get the ticket
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId!);
        if (!ticket) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")],
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }

        // Now defer the update since we confirmed it's a valid ticket
        await interaction.deferUpdate().catch(deferError => {
            client.logger.warn(`[TICKET_MODAL] Could not defer modal: ${deferError}`);
            // Continue anyway - we'll try to reply directly if needed
        });

        // Get reason from modal
        const reason = interaction.fields.getTextInputValue("ticket_close_reason") || "No reason provided";

        // Log that we're updating the database, in case later steps fail
        client.logger.info(`[TICKET_CLOSE] Closing ticket #${ticket.ticketNumber} with reason: ${reason}`);

        // Update ticket status in database early
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.CLOSED,
            interaction.user.id,
            reason
        );

        // Get the ticket message configuration
        const ticketMessage = await ticketRepo.getTicketMessage(ticket.category.id);
        const category = ticket.category;

        // Create close message embed
        const closeEmbed = new discord.EmbedBuilder()
            .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
            .setDescription(ticketMessage?.closeMessage || "This ticket has been closed.")
            .addFields(
                { name: "Ticket ID", value: `#${ticket.ticketNumber}`, inline: true },
                { name: "Category", value: `${category.emoji || "🎫"} ${category.name}`, inline: true },
                { name: "Status", value: `🔴 Closed`, inline: true },
                { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: "Reason", value: reason, inline: false }
            )
            .setColor("Red")
            .setFooter({ text: `Use /ticket reopen to reopen this ticket | ID: ${ticket.id}` })
            .setTimestamp();

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Send the close message to the channel
        await channel.send({ embeds: [closeEmbed] }).catch(sendError => {
            client.logger.error(`[TICKET_CLOSE] Error sending close message: ${sendError}`);
            // Continue with the process even if we can't send the message
        });

        // Update channel permissions to prevent further messages
        try {
            await channel.permissionOverwrites.create(
                interaction.guild!.roles.everyone,
                { SendMessages: false }
            );

            // Create action row with management buttons
            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_reopen")
                        .setLabel("Reopen")
                        .setStyle(discord.ButtonStyle.Success),
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_archive")
                        .setLabel("Archive")
                        .setStyle(discord.ButtonStyle.Secondary),
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_delete")
                        .setLabel("Delete")
                        .setStyle(discord.ButtonStyle.Danger)
                );

            // Send a response with management buttons
            // Use a safer approach - check if we can use followUp or if we need to send directly
            try {
                if (interaction.deferred) {
                    await interaction.followUp({
                        embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                        components: [actionRow]
                    });
                } else {
                    // If not deferred, try a direct reply
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                        components: [actionRow]
                    });
                }
            } catch (replyError) {
                client.logger.warn(`[TICKET_CLOSE] Could not send confirmation: ${replyError}`);
                // Send to channel as fallback
                await channel.send({
                    embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                    components: [actionRow]
                }).catch(channelError => {
                    client.logger.error(`[TICKET_CLOSE] Also failed to send to channel: ${channelError}`);
                });
            }

            // Generate and send transcript
            try {
                await createAndSendTranscript(
                    channel,
                    interaction.user,
                    reason,
                    ticket.id,
                    ticketRepo.dataSource
                );
            } catch (transcriptError) {
                client.logger.error(`[TICKET_CLOSE] Error creating transcript: ${transcriptError}`);
                // We've already handled the main closing process, so just log this error
            }
        } catch (error) {
            client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);

            // Safely notify about permission issues
            try {
                // Send to channel since it's more reliable
                await channel.send({
                    embeds: [
                        new EmbedTemplate(client).warning("Ticket marked as closed, but could not update channel permissions.")
                            .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                    ]
                });
            } catch (sendError) {
                client.logger.error(`[TICKET_CLOSE] Failed to send permission error to channel: ${sendError}`);
            }
        }
    } catch (error) {
        client.logger.error(`[TICKET_MODAL] Error handling close modal: ${error}`);

        try {
            // Check interaction state before trying to respond
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while closing the ticket.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } else if (interaction.deferred) {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred while closing the ticket.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_MODAL] Failed to send error response: ${responseError}`);

            // Final fallback: try to send to the channel directly
            try {
                const channel = interaction.channel as discord.TextChannel;
                if (channel) {
                    await channel.send({
                        embeds: [new EmbedTemplate(client).error("An error occurred while processing the ticket close request.")]
                    });
                }
            } catch (channelError) {
                client.logger.error(`[TICKET_MODAL] Failed to send error to channel: ${channelError}`);
            }
        }
    }
};

export default event;