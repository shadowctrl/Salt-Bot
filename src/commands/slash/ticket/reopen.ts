import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";

export const reopenTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Check if the command is being used in a ticket channel
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        // Check if the ticket is already open
        if (ticket.status === "open") {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This ticket is already open.")]
            });
            return;
        }

        // Update ticket status in database
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.OPEN
        );

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Create reopen message embed
        const reopenEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Reopened")
            .setDescription("This ticket has been reopened.")
            .addFields(
                { name: "Reopened By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Reopened At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setColor("Green")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send reopen message
        await channel.send({ embeds: [reopenEmbed] });

        // Update channel permissions to allow messages again
        try {
            // Get original permissions
            await channel.permissionOverwrites.edit(
                interaction.guild!.roles.everyone,
                { SendMessages: null }
            );

            // Make sure creator can still view and send messages
            await channel.permissionOverwrites.edit(
                ticket.creatorId,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

            // If there's a support role for this category, ensure they have permissions
            if (ticket.category.supportRoleId) {
                await channel.permissionOverwrites.edit(
                    ticket.category.supportRoleId,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }
                );
            }

            // Create action row with close button
            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_close")
                        .setLabel("Close Ticket")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            // Send success message with close button
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).success("Ticket reopened successfully.")],
                components: [actionRow]
            });
        } catch (error) {
            client.logger.error(`[TICKET_REOPEN] Error updating permissions: ${error}`);

            // Still mark the ticket as open in DB but inform about permission issues
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).warning("Ticket marked as reopened, but could not update channel permissions.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_REOPEN] Error reopening ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while reopening the ticket.")]
        });
    }
};