import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

export const removeUserFromTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Check if this is a ticket channel
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
            });
            return;
        }

        // Check permissions - either support role, ticket creator, or manage channels permission
        const member = interaction.member as discord.GuildMember;
        const supportRoleId = ticket.category.supportRoleId;

        const hasPermission =
            member.permissions.has(discord.PermissionFlagsBits.ManageChannels) ||
            interaction.user.id === ticket.creatorId ||
            (supportRoleId && member.roles.cache.has(supportRoleId));

        if (!hasPermission) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You don't have permission to remove users from this ticket.")]
            });
            return;
        }

        // Get the user to remove
        const userToRemove = interaction.options.getUser("user");
        if (!userToRemove) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Please specify a valid user to remove.")]
            });
            return;
        }

        // Make sure they're not trying to remove the ticket creator
        if (userToRemove.id === ticket.creatorId) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You cannot remove the ticket creator from the ticket.")]
            });
            return;
        }

        // Check if it's a bot
        if (userToRemove.bot && userToRemove.id !== client.user?.id) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You cannot remove bots from tickets.")]
            });
            return;
        }

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Check if user already doesn't have access
        const permissions = channel.permissionsFor(userToRemove.id);
        if (!permissions?.has(discord.PermissionFlagsBits.ViewChannel)) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).warning(`${userToRemove} doesn't have access to this ticket.`)]
            });
            return;
        }

        // Remove the user from the channel
        await channel.permissionOverwrites.delete(userToRemove.id);

        // Send success message
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success(`${userToRemove} has been removed from the ticket.`)]
        });

        // Notify in the channel about the removed user
        await channel.send({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("User Removed")
                    .setDescription(`${userToRemove} has been removed from this ticket by ${interaction.user}.`)
                    .setColor("Red")
                    .setTimestamp()
            ]
        });

        client.logger.info(`[TICKET_REMOVE] ${interaction.user.tag} removed ${userToRemove.tag} from ticket #${ticket.ticketNumber}`);
    } catch (error) {
        client.logger.error(`[TICKET_REMOVE] Error removing user from ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while removing the user from the ticket.")]
        });
    }
};