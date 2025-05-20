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
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        if (ticket.status === "open") {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This ticket is already open.")]
            });
            return;
        }

        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.OPEN
        );

        const channel = interaction.channel as discord.TextChannel;

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

        await channel.send({ embeds: [reopenEmbed] });

        try {
            await channel.permissionOverwrites.edit(
                interaction.guild!.roles.everyone,
                { SendMessages: null }
            );

            await channel.permissionOverwrites.edit(
                ticket.creatorId,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

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

            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_close")
                        .setLabel("Close Ticket")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            await interaction.editReply({
                embeds: [new EmbedTemplate(client).success("Ticket reopened successfully.")],
                components: [actionRow]
            });
        } catch (error) {
            client.logger.error(`[TICKET_REOPEN] Error updating permissions: ${error}`);
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