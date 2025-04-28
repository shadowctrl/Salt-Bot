import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

export const infoTicket = async (
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

        // Get creator user
        const creator = await client.users.fetch(ticket.creatorId).catch(() => null);

        // Get closer user (if ticket is closed)
        let closer = null;
        if (ticket.closedById) {
            closer = await client.users.fetch(ticket.closedById).catch(() => null);
        }

        // Format creation time
        const creationTime = new Date(ticket.createdAt);
        const creationTimestamp = Math.floor(creationTime.getTime() / 1000);

        // Format closed time (if closed)
        let closedTimestamp = null;
        if (ticket.closedAt) {
            const closedTime = new Date(ticket.closedAt);
            closedTimestamp = Math.floor(closedTime.getTime() / 1000);
        }

        // Get category information
        const category = ticket.category;

        // Create embed with detailed ticket information
        const embed = new discord.EmbedBuilder()
            .setTitle(`Ticket Information: #${ticket.ticketNumber}`)
            .setDescription(`This is ticket #${ticket.ticketNumber} in the ${category.emoji || "🎫"} **${category.name}** category.`)
            .addFields(
                { name: "Status", value: ticket.status === "open" ? "🟢 Open" : (ticket.status === "closed" ? "🔴 Closed" : "🔵 Archived"), inline: true },
                { name: "Created By", value: creator ? `${creator} (${creator.tag})` : `Unknown User (${ticket.creatorId})`, inline: true },
                { name: "Created At", value: `<t:${creationTimestamp}:F>`, inline: true }
            )
            .setColor(ticket.status === "open" ? "Green" : (ticket.status === "closed" ? "Red" : "Blue"))
            .setFooter({ text: `Ticket ID: ${ticket.id}` })
            .setTimestamp();

        // Add closer information if ticket is closed
        if (ticket.status !== "open" && closer) {
            embed.addFields(
                { name: "Closed By", value: `${closer} (${closer.tag})`, inline: true },
                { name: "Closed At", value: closedTimestamp ? `<t:${closedTimestamp}:F>` : "Unknown", inline: true },
                { name: "Reason", value: ticket.closeReason || "No reason provided", inline: false }
            );
        }

        // Add category support role if available
        if (category.supportRoleId) {
            embed.addFields({
                name: "Support Role",
                value: `<@&${category.supportRoleId}>`,
                inline: true
            });
        }

        // Add ticket channel category information
        const channel = interaction.channel as discord.TextChannel;
        if (channel.parent) {
            embed.addFields({
                name: "Channel Category",
                value: channel.parent.name,
                inline: true
            });
        }

        // Add Discord channel ID
        embed.addFields({
            name: "Channel ID",
            value: interaction.channelId,
            inline: true
        });

        // Send the information
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        client.logger.error(`[TICKET_INFO] Error getting ticket info: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while getting ticket information.")]
        });
    }
}