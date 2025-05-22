import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { createAndSendTranscript } from "../../../utils/transcript";

export const closeTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        if (ticket.status !== "open") {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This ticket is already closed.")]
            });
            return;
        }

        const reason = interaction.options.getString("reason") || "No reason provided";

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
        await channel.send({ embeds: [closeEmbed] });

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

            await interaction.editReply({
                embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                components: [actionRow]
            });

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
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).warning("Could not generate transcript. The ticket has been closed, but no transcript was created.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).warning("Ticket marked as closed, but could not update channel permissions.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CLOSE] Error closing ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while closing the ticket.")]
        });
    }
};