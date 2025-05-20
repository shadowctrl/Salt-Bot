import discord from "discord.js";
import { BotEvent } from "../../../types";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { EmbedTemplate } from "../../../utils/embed_template";
import { createAndSendTranscript } from '../../../utils/transcript';

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        if (!interaction.isModalSubmit()) return;

        try {
            if (!(client as any).dataSource) {
                client.logger.error("[TICKET_MODAL] Database connection is not available");
                return;
            }
            if (interaction.customId === "ticket_close_modal") {
                await handleTicketCloseModal(interaction, client);
            }
        } catch (error) {
            client.logger.error(`[TICKET_MODAL] Error handling modal submission: ${error}`);
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
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId!);
        if (!ticket) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")],
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferUpdate().catch(deferError => {
            client.logger.warn(`[TICKET_MODAL] Could not defer modal: ${deferError}`);
        });

        const reason = interaction.fields.getTextInputValue("ticket_close_reason") || "No reason provided";
        client.logger.info(`[TICKET_CLOSE] Closing ticket #${ticket.ticketNumber} with reason: ${reason}`);

        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.CLOSED,
            interaction.user.id,
            reason
        );

        const ticketMessage = await ticketRepo.getTicketMessage(ticket.category.id);
        const category = ticket.category;
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

        const channel = interaction.channel as discord.TextChannel;
        await channel.send({ embeds: [closeEmbed] }).catch(sendError => {
            client.logger.error(`[TICKET_CLOSE] Error sending close message: ${sendError}`);
        });

        try {
            await channel.permissionOverwrites.create(
                interaction.guild!.roles.everyone,
                { SendMessages: false }
            );

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

            try {
                if (interaction.deferred) {
                    await interaction.followUp({
                        embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                        components: [actionRow]
                    });
                } else {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                        components: [actionRow]
                    });
                }
            } catch (replyError) {
                client.logger.warn(`[TICKET_CLOSE] Could not send confirmation: ${replyError}`);
                await channel.send({
                    embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                    components: [actionRow]
                }).catch(channelError => {
                    client.logger.error(`[TICKET_CLOSE] Also failed to send to channel: ${channelError}`);
                });
            }

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
            }
        } catch (error) {
            client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);

            try {
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