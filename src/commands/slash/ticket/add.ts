import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

export const addUserToTicket = async (
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
                embeds: [new EmbedTemplate(client).error("You don't have permission to add users to this ticket.")]
            });
            return;
        }

        // Get the user to add
        const userToAdd = interaction.options.getUser("user");
        if (!userToAdd) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Please specify a valid user to add.")]
            });
            return;
        }

        // Check if it's a bot
        if (userToAdd.bot) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You cannot add bots to tickets.")]
            });
            return;
        }

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Check if user already has access
        const permissions = channel.permissionsFor(userToAdd.id);
        if (permissions?.has(discord.PermissionFlagsBits.ViewChannel)) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).warning(`${userToAdd} already has access to this ticket.`)]
            });
            return;
        }

        // Add the user to the channel
        await channel.permissionOverwrites.create(userToAdd.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });

        // Send success message
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success(`${userToAdd} has been added to the ticket.`)]
        });

        // Notify in the channel about the added user
        await channel.send({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("User Added")
                    .setDescription(`${userToAdd} has been added to this ticket by ${interaction.user}.`)
                    .setColor("Green")
                    .setTimestamp()
            ]
        });

        client.logger.info(`[TICKET_ADD] ${interaction.user.tag} added ${userToAdd.tag} to ticket #${ticket.ticketNumber}`);
    } catch (error) {
        client.logger.error(`[TICKET_ADD] Error adding user to ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while adding the user to the ticket.")]
        });
    }
};