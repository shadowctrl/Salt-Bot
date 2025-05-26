import discord from "discord.js";
import { BotEvent } from "../../../types";
import { Ticket } from "../../../utils/ticket";
import { EmbedTemplate } from "../../../utils/embed_template";

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
        const ticketManager = new Ticket((client as any).dataSource, client);
        const ticket = await ticketManager.getInfo(interaction.channelId!);

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

        const result = await ticketManager.close({
            channelId: interaction.channelId!,
            userId: interaction.user.id,
            reason: reason,
            generateTranscript: true
        });

        if (result.success) {
            try {
                if (interaction.deferred) {
                    await interaction.followUp({
                        embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                    });
                } else {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                    });
                }
            } catch (replyError) {
                client.logger.warn(`[TICKET_CLOSE] Could not send confirmation: ${replyError}`);
                const channel = interaction.channel as discord.TextChannel;
                await channel.send({
                    embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                }).catch(channelError => {
                    client.logger.error(`[TICKET_CLOSE] Also failed to send to channel: ${channelError}`);
                });
            }
        } else {
            try {
                if (interaction.deferred) {
                    await interaction.followUp({
                        embeds: [new EmbedTemplate(client).error(result.message)],
                        flags: discord.MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error(result.message)],
                        flags: discord.MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                client.logger.error(`[TICKET_CLOSE] Failed to send error response: ${replyError}`);
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