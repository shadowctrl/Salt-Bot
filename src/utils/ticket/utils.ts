import discord from "discord.js";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../events/database/entities/ticket_system";
import { ChannelCreationResult } from "./types";
import { ITicket, ITicketCategory } from "../../types";

/**
 * Utility class for ticket-related operations
 * Contains helper functions for channel management, message sending, and permission updates
 */
export class TicketUtils {
    private ticketRepo: TicketRepository;
    private client: discord.Client;

    constructor(ticketRepo: TicketRepository, client: discord.Client) {
        this.ticketRepo = ticketRepo;
        this.client = client;
    }

    /**
     * Get user's open ticket in a guild
     * @param guildId - Discord guild ID
     * @param userId - Discord user ID
     * @returns Promise resolving to open ticket or null
     */
    public getUserOpenTicket = async (guildId: string, userId: string): Promise<ITicket | null> => {
        try {
            const guildTickets = await this.ticketRepo.getGuildTickets(guildId);
            const userOpenTickets = guildTickets.filter(ticket =>
                ticket.creatorId === userId && ticket.status === ITicketStatus.OPEN
            );
            return userOpenTickets.length > 0 ? userOpenTickets[0] : null;
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error getting user open ticket: ${error}`);
            return null;
        }
    };

    /**
     * Create a ticket channel with proper permissions
     * @param guild - Discord guild
     * @param category - Ticket category
     * @param userId - User ID who is creating the ticket
     * @returns Channel creation result
     */
    public createTicketChannel = async (
        guild: discord.Guild,
        category: ITicketCategory,
        userId: string
    ): Promise<ChannelCreationResult> => {
        try {
            const tempChannelName = `ticket-new`;
            const ticketChannel = await guild.channels.create({
                name: tempChannelName,
                type: discord.ChannelType.GuildText,
                parent: category.categoryId,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: [discord.PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: this.client.user!.id,
                        allow: [
                            discord.PermissionFlagsBits.ViewChannel,
                            discord.PermissionFlagsBits.SendMessages,
                            discord.PermissionFlagsBits.ManageChannels,
                            discord.PermissionFlagsBits.ReadMessageHistory
                        ]
                    },
                    {
                        id: userId,
                        allow: [
                            discord.PermissionFlagsBits.ViewChannel,
                            discord.PermissionFlagsBits.SendMessages,
                            discord.PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ]
            });

            return {
                success: true,
                channel: ticketChannel
            };
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error creating ticket channel: ${error}`);
            return {
                success: false,
                message: "Failed to create ticket channel."
            };
        }
    };

    /**
     * Set up channel permissions for support role and other roles
     * @param channel - Discord text channel
     * @param category - Ticket category
     * @param userId - User ID of the ticket creator
     */
    public setupChannelPermissions = async (
        channel: discord.TextChannel,
        category: ITicketCategory,
        userId: string
    ): Promise<void> => {
        try {
            if (category.supportRoleId) {
                await channel.permissionOverwrites.create(
                    category.supportRoleId,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }
                );
            }
        } catch (error) {
            this.client.logger.warn(`[TICKET_UTILS] Could not set permissions for support role: ${error}`);
        }
    };

    /**
     * Send welcome message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param category - Ticket category
     * @param userId - User ID of the ticket creator
     */
    public sendWelcomeMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        category: ITicketCategory,
        userId: string
    ): Promise<void> => {
        try {
            const ticketMessage = category.ticketMessage;
            const welcomeMessage = ticketMessage?.welcomeMessage ||
                `Welcome to your ticket in the **${category.name}** category!\n\nPlease describe your issue and wait for a staff member to assist you.`;

            const creationTimestamp = Math.floor(Date.now() / 1000);

            const welcomeEmbed = new discord.EmbedBuilder()
                .setTitle(`Ticket #${ticket.ticketNumber}`)
                .setDescription(welcomeMessage)
                .addFields(
                    { name: "Ticket ID", value: `#${ticket.ticketNumber}`, inline: true },
                    { name: "Category", value: `${category.emoji || "🎫"} ${category.name}`, inline: true },
                    { name: "Status", value: `🟢 Open`, inline: true },
                    { name: "Created By", value: `<@${userId}>`, inline: true },
                    { name: "Created At", value: `<t:${creationTimestamp}:F>`, inline: true }
                )
                .setColor("Green")
                .setFooter({ text: `Use /ticket close to close this ticket | ID: ${ticket.id}` })
                .setTimestamp();

            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_claim")
                        .setLabel("Claim Ticket")
                        .setStyle(discord.ButtonStyle.Primary)
                        .setEmoji("👋"),
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_close")
                        .setLabel("Close Ticket")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            await channel.send({
                content: ticketMessage?.includeSupportTeam && category.supportRoleId ?
                    `<@${userId}> | <@&${category.supportRoleId}>` :
                    `<@${userId}>`,
                embeds: [welcomeEmbed],
                components: [actionRow]
            });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending welcome message: ${error}`);
        }
    };

    /**
     * Send close message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param userId - User ID who closed the ticket
     * @param reason - Reason for closing
     */
    public sendCloseMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        userId: string,
        reason?: string
    ): Promise<void> => {
        try {
            const ticketMessage = await this.ticketRepo.getTicketMessage(ticket.category.id);
            const category = ticket.category;

            const closeEmbed = new discord.EmbedBuilder()
                .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
                .setDescription(ticketMessage?.closeMessage || "This ticket has been closed.")
                .addFields(
                    { name: "Ticket ID", value: `#${ticket.ticketNumber}`, inline: true },
                    { name: "Category", value: `${category.emoji || "🎫"} ${category.name}`, inline: true },
                    { name: "Status", value: `🔴 Closed`, inline: true },
                    { name: "Closed By", value: `<@${userId}>`, inline: true },
                    { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: "Reason", value: reason || "No reason provided", inline: false }
                )
                .setColor("Red")
                .setFooter({ text: `Use /ticket reopen to reopen this ticket | ID: ${ticket.id}` })
                .setTimestamp();

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

            await channel.send({ embeds: [closeEmbed], components: [actionRow] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending close message: ${error}`);
        }
    };

    /**
     * Send reopen message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param userId - User ID who reopened the ticket
     */
    public sendReopenMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        userId: string
    ): Promise<void> => {
        try {
            const reopenEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Reopened")
                .setDescription("This ticket has been reopened.")
                .addFields(
                    { name: "Reopened By", value: `<@${userId}>`, inline: true },
                    { name: "Reopened At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setColor("Green")
                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
                .setTimestamp();

            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_claim")
                        .setLabel("Claim Ticket")
                        .setStyle(discord.ButtonStyle.Primary)
                        .setEmoji("👋"),
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_close")
                        .setLabel("Close Ticket")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            await channel.send({ embeds: [reopenEmbed], components: [actionRow] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending reopen message: ${error}`);
        }
    };

    /**
     * Send claim message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param userId - User ID who claimed the ticket
     */
    public sendClaimMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        userId: string
    ): Promise<void> => {
        try {
            const claimEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Claimed")
                .setDescription(`This ticket is now being handled by <@${userId}>.`)
                .addFields(
                    { name: "Claimed By", value: `<@${userId}>`, inline: true },
                    { name: "Claimed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setColor("Blue")
                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
                .setTimestamp();

            await channel.send({ embeds: [claimEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending claim message: ${error}`);
        }
    };

    /**
     * Send unclaim message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param userId - User ID who unclaimed the ticket
     */
    public sendUnclaimMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        userId: string
    ): Promise<void> => {
        try {
            const unclaimEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Unclaimed")
                .setDescription(`This ticket is no longer being handled by <@${userId}>.`)
                .setColor("Orange")
                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
                .setTimestamp();

            await channel.send({ embeds: [unclaimEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending unclaim message: ${error}`);
        }
    };

    /**
     * Send archive message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param userId - User ID who archived the ticket
     */
    public sendArchiveMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        userId: string
    ): Promise<void> => {
        try {
            const archiveEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Archived")
                .setDescription("This ticket has been archived and will be stored for reference.")
                .addFields(
                    { name: "Archived By", value: `<@${userId}>`, inline: true },
                    { name: "Archived At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setColor("Blue")
                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
                .setTimestamp();

            await channel.send({ embeds: [archiveEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending archive message: ${error}`);
        }
    };

    /**
     * Send user added message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param targetUser - User who was added
     * @param requesterId - User ID who made the request
     */
    public sendUserAddedMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        targetUser: discord.User,
        requesterId: string
    ): Promise<void> => {
        try {
            const addedEmbed = new discord.EmbedBuilder()
                .setTitle("User Added")
                .setDescription(`${targetUser} has been added to this ticket by <@${requesterId}>.`)
                .setColor("Green")
                .setTimestamp();

            await channel.send({ embeds: [addedEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending user added message: ${error}`);
        }
    };

    /**
     * Send user removed message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param targetUser - User who was removed
     * @param requesterId - User ID who made the request
     */
    public sendUserRemovedMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        targetUser: discord.User,
        requesterId: string
    ): Promise<void> => {
        try {
            const removedEmbed = new discord.EmbedBuilder()
                .setTitle("User Removed")
                .setDescription(`${targetUser} has been removed from this ticket by <@${requesterId}>.`)
                .setColor("Red")
                .setTimestamp();

            await channel.send({ embeds: [removedEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending user removed message: ${error}`);
        }
    };

    /**
     * Send ownership transfer message to ticket channel
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     * @param previousOwner - Previous owner user object
     * @param newOwner - New owner user object
     * @param requesterId - User ID who made the request
     */
    public sendOwnershipTransferMessage = async (
        channel: discord.TextChannel,
        ticket: ITicket,
        previousOwner: discord.User | null,
        newOwner: discord.User,
        requesterId: string
    ): Promise<void> => {
        try {
            const transferEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Ownership Transferred")
                .setDescription(`Ownership of this ticket has been transferred from ${previousOwner ? `${previousOwner}` : 'the previous owner'} to ${newOwner}.`)
                .setColor("Green")
                .setTimestamp();

            await channel.send({ embeds: [transferEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error sending ownership transfer message: ${error}`);
        }
    };

    /**
     * Send deletion notification to ticket creator
     * @param creator - User object of ticket creator
     * @param ticket - Ticket object
     */
    public sendDeletionNotification = async (creator: discord.User, ticket: ITicket): Promise<void> => {
        try {
            const deleteEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Deleted")
                .setDescription(`Ticket #${ticket.ticketNumber} has been deleted.`)
                .setColor("Red")
                .setTimestamp();

            await creator.send({ embeds: [deleteEmbed] });
        } catch (error) {
            this.client.logger.warn(`[TICKET_UTILS] Could not send DM to ticket creator: ${error}`);
        }
    };

    /**
     * Update channel permissions for ticket closure
     * @param channel - Discord text channel
     */
    public updateChannelPermissionsForClosure = async (channel: discord.TextChannel): Promise<void> => {
        try {
            await channel.permissionOverwrites.create(
                channel.guild.roles.everyone,
                { SendMessages: false }
            );
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error updating closure permissions: ${error}`);
        }
    };

    /**
     * Update channel permissions for ticket reopen
     * @param channel - Discord text channel
     * @param ticket - Ticket object
     */
    public updateChannelPermissionsForReopen = async (
        channel: discord.TextChannel,
        ticket: ITicket
    ): Promise<void> => {
        try {
            await channel.permissionOverwrites.edit(
                channel.guild.roles.everyone,
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
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error updating reopen permissions: ${error}`);
        }
    };

    /**
     * Set up permissions for new ticket owner
     * @param channel - Discord text channel
     * @param newOwnerId - New owner user ID
     */
    public setupOwnerPermissions = async (channel: discord.TextChannel, newOwnerId: string): Promise<void> => {
        try {
            await channel.permissionOverwrites.create(newOwnerId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
        } catch (error) {
            this.client.logger.error(`[TICKET_UTILS] Error setting up owner permissions: ${error}`);
        }
    };

    /**
     * Update channel name with new owner information
     * @param channel - Discord text channel
     * @param ticketNumber - Ticket number
     * @param newOwnerUsername - New owner username
     */
    public updateChannelName = async (
        channel: discord.TextChannel,
        ticketNumber: number,
        newOwnerUsername: string
    ): Promise<void> => {
        try {
            const currentName = channel.name;
            const ticketNumberStr = ticketNumber.toString().padStart(4, '0');

            if (currentName.includes(ticketNumberStr)) {
                const newOwnerName = newOwnerUsername.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 15);
                if (currentName.includes('-')) {
                    const baseName = currentName.split('-').slice(0, 2).join('-');
                    await channel.setName(`${baseName}-${newOwnerName}`);
                }
            }
        } catch (error) {
            this.client.logger.warn(`[TICKET_UTILS] Could not rename channel: ${error}`);
        }
    };
}