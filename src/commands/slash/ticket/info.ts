import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { Ticket } from "../../../utils/ticket";

export const infoTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        const ticketManager = new Ticket((client as any).dataSource, client);
        const ticket = await ticketManager.getInfo(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        const creator = await client.users.fetch(ticket.creatorId).catch(() => null);
        let closer = null;
        if (ticket.closedById) {
            closer = await client.users.fetch(ticket.closedById).catch(() => null);
        }

        let claimer = null;
        if (ticket.claimedById) {
            claimer = await client.users.fetch(ticket.claimedById).catch(() => null);
        }

        const creationTime = new Date(ticket.createdAt);
        const creationTimestamp = Math.floor(creationTime.getTime() / 1000);

        let closedTimestamp = null;
        if (ticket.closedAt) {
            const closedTime = new Date(ticket.closedAt);
            closedTimestamp = Math.floor(closedTime.getTime() / 1000);
        }

        let claimedTimestamp = null;
        if (ticket.claimedAt) {
            const claimedTime = new Date(ticket.claimedAt);
            claimedTimestamp = Math.floor(claimedTime.getTime() / 1000);
        }

        const category = ticket.category;

        const embed = new discord.EmbedBuilder()
            .setTitle(`Ticket Information: #${ticket.ticketNumber}`)
            .setDescription(`This is ticket #${ticket.ticketNumber} in the ${category.emoji || "🎫"} **${category.name}** category.`)
            .addFields(
                { name: "Status", value: ticket.status === "open" ? "🟢 Open" : (ticket.status === "closed" ? "🔴 Closed" : "🔵 Archived"), inline: true },
                { name: "Created By", value: creator ? `${creator} (${creator.tag})` : `Unknown User (${ticket.creatorId})`, inline: true },
                { name: "Created At", value: `<t:${creationTimestamp}:F>`, inline: true }
            )
            .setColor(ticket.status === "open" ? (ticket.claimedById ? "Blue" : "Green") : (ticket.status === "closed" ? "Red" : "Blue"))
            .setFooter({ text: `Ticket ID: ${ticket.id}` })
            .setTimestamp();

        if (ticket.claimedById && claimer) {
            embed.addFields(
                { name: "Claimed By", value: `${claimer} (${claimer.tag})`, inline: true },
                { name: "Claimed At", value: claimedTimestamp ? `<t:${claimedTimestamp}:F>` : "Unknown", inline: true }
            );
        }

        if (ticket.status !== "open" && closer) {
            embed.addFields(
                { name: "Closed By", value: `${closer} (${closer.tag})`, inline: true },
                { name: "Closed At", value: closedTimestamp ? `<t:${closedTimestamp}:F>` : "Unknown", inline: true },
                { name: "Reason", value: ticket.closeReason || "No reason provided", inline: false }
            );
        }

        if (category.supportRoleId) {
            embed.addFields({
                name: "Support Role",
                value: `<@&${category.supportRoleId}>`,
                inline: true
            });
        }

        const channel = interaction.channel as discord.TextChannel;
        if (channel.parent) {
            embed.addFields({
                name: "Channel Category",
                value: channel.parent.name,
                inline: true
            });
        }

        embed.addFields({
            name: "Channel ID",
            value: interaction.channelId,
            inline: true
        });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        client.logger.error(`[TICKET_INFO] Error getting ticket info: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while getting ticket information.")]
        });
    }
};