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
        // Check if the command is being used in a ticket channel
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        // Check if the ticket is already closed
        if (ticket.status !== "open") {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This ticket is already closed.")]
            });
            return;
        }

        // Get the reason from command options
        const reason = interaction.options.getString("reason") || "No reason provided";

        // Update ticket status in database
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.CLOSED,
            interaction.user.id,
            reason
        );

        // Get the ticket message configuration
        const ticketMessage = await ticketRepo.getTicketMessage(ticket.category.id);
        const category = ticket.category;

        // Create close message embed with detailed information
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

        // Send close message
        await channel.send({ embeds: [closeEmbed] });

        // Update channel permissions to prevent further messages
        try {
            await channel.permissionOverwrites.create(
                interaction.guild!.roles.everyone,
                { SendMessages: false }
            );

            // Create action row with reopen, archive, and delete buttons
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

            // Send success message with buttons
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                components: [actionRow]
            });

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
                // Continue with closing the ticket even if transcript fails
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).warning("Could not generate transcript. The ticket has been closed, but no transcript was created.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);

            // Still mark the ticket as closed in DB but inform about permission issues
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