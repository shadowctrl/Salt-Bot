import discord from "discord.js";

import client from "../../salt";
import { ITicket, PermissionCheckResult, TicketAction } from "../../types";


/**
 * Utility class for checking ticket-related permissions
 * Handles permission validation for various ticket operations
 */
export class TicketPermissions {
    /**
     * Check if a user has permission to perform a specific ticket action
     * @param userId - Discord user ID
     * @param ticket - Ticket object
     * @param action - Action to check permission for
     * @param guildId - Discord guild ID
     * @returns Permission check result
     */
    public checkTicketPermission = async (
        userId: string,
        ticket: ITicket,
        action: TicketAction,
        guildId: string
    ): Promise<PermissionCheckResult> => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return {
                    hasPermission: false,
                    reason: "Guild not found."
                };
            }

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return {
                    hasPermission: false,
                    reason: "Member not found in guild."
                };
            }

            switch (action) {
                case 'claim':
                    return this.checkClaimPermission(member, ticket);

                case 'close':
                    return this.checkClosePermission(member, ticket);

                case 'add_user':
                case 'remove_user':
                    return this.checkUserManagementPermission(member, ticket);

                case 'transfer_ownership':
                    return this.checkTransferOwnershipPermission(member, ticket);

                case 'archive':
                    return this.checkArchivePermission(member, ticket);

                case 'delete':
                    return this.checkDeletePermission(member, ticket);

                default:
                    return {
                        hasPermission: false,
                        reason: "Unknown action."
                    };
            }
        } catch (error) {
            client.logger.error(`[TICKET_PERMISSIONS] Error checking permission: ${error}`);
            return {
                hasPermission: false,
                reason: "An error occurred while checking permissions."
            };
        }
    };

    /**
     * Check if a user can claim/unclaim tickets
     * @param member - Discord guild member
     * @param ticket - Ticket object
     * @returns Permission check result
     */
    private checkClaimPermission = (member: discord.GuildMember, ticket: ITicket): PermissionCheckResult => {

        if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.ManageChannels)) {
            return { hasPermission: true };
        }

        if (ticket.category.supportRoleId && member.roles.cache.has(ticket.category.supportRoleId)) {
            return { hasPermission: true };
        }

        return {
            hasPermission: false,
            reason: "You don't have permission to claim tickets. Only support team members and administrators can claim tickets."
        };
    };

    /**
     * Check if a user can close tickets
     * @param member - Discord guild member
     * @param ticket - Ticket object
     * @returns Permission check result
     */
    private checkClosePermission = (member: discord.GuildMember, ticket: ITicket): PermissionCheckResult => {

        if (member.id === ticket.creatorId) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.ManageChannels)) {
            return { hasPermission: true };
        }

        if (ticket.category.supportRoleId && member.roles.cache.has(ticket.category.supportRoleId)) {
            return { hasPermission: true };
        }

        return {
            hasPermission: false,
            reason: "You don't have permission to close this ticket."
        };
    };

    /**
     * Check if a user can add/remove users from tickets
     * @param member - Discord guild member
     * @param ticket - Ticket object
     * @returns Permission check result
     */
    private checkUserManagementPermission = (member: discord.GuildMember, ticket: ITicket): PermissionCheckResult => {

        if (member.id === ticket.creatorId) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.ManageChannels)) {
            return { hasPermission: true };
        }

        if (ticket.category.supportRoleId && member.roles.cache.has(ticket.category.supportRoleId)) {
            return { hasPermission: true };
        }

        return {
            hasPermission: false,
            reason: "You don't have permission to manage users in this ticket."
        };
    };

    /**
     * Check if a user can transfer ticket ownership
     * @param member - Discord guild member
     * @param ticket - Ticket object
     * @returns Permission check result
     */
    private checkTransferOwnershipPermission = (member: discord.GuildMember, ticket: ITicket): PermissionCheckResult => {

        if (member.id === ticket.creatorId) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
            return { hasPermission: true };
        }

        if (ticket.category.supportRoleId && member.roles.cache.has(ticket.category.supportRoleId)) {
            return { hasPermission: true };
        }

        return {
            hasPermission: false,
            reason: "You don't have permission to transfer ticket ownership. You need to be an administrator, the ticket creator, or have the support role."
        };
    };

    /**
     * Check if a user can archive tickets
     * @param member - Discord guild member
     * @param ticket - Ticket object
     * @returns Permission check result
     */
    private checkArchivePermission = (member: discord.GuildMember, ticket: ITicket): PermissionCheckResult => {

        if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.ManageChannels)) {
            return { hasPermission: true };
        }

        if (ticket.category.supportRoleId && member.roles.cache.has(ticket.category.supportRoleId)) {
            return { hasPermission: true };
        }

        return {
            hasPermission: false,
            reason: "You don't have permission to archive tickets. Only support team members and administrators can archive tickets."
        };
    };

    /**
     * Check if a user can delete tickets
     * @param member - Discord guild member
     * @param ticket - Ticket object
     * @returns Permission check result
     */
    private checkDeletePermission = (member: discord.GuildMember, ticket: ITicket): PermissionCheckResult => {

        if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
            return { hasPermission: true };
        }

        if (member.permissions.has(discord.PermissionFlagsBits.ManageChannels)) {
            return { hasPermission: true };
        }

        return {
            hasPermission: false,
            reason: "You need the 'Manage Channels' permission or Administrator permission to delete tickets."
        };
    };

    /**
     * Check if a user is a bot owner
     * @param userId - Discord user ID
     * @returns Whether the user is a bot owner
     */
    public isBotOwner = (userId: string): boolean => {
        try {
            return client.config.bot.owners.includes(userId);
        } catch (error) {
            return false;
        }
    };

    /**
     * Check if a user has administrator permissions in a guild
     * @param userId - Discord user ID
     * @param guildId - Discord guild ID
     * @returns Promise resolving to whether user has admin permissions
     */
    public hasAdminPermissions = async (userId: string, guildId: string): Promise<boolean> => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return false;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return false;

            return member.permissions.has(discord.PermissionFlagsBits.Administrator);
        } catch (error) {
            client.logger.error(`[TICKET_PERMISSIONS] Error checking admin permissions: ${error}`);
            return false;
        }
    };

    /**
     * Check if a user has a specific role
     * @param userId - Discord user ID
     * @param guildId - Discord guild ID
     * @param roleId - Role ID to check
     * @returns Promise resolving to whether user has the role
     */
    public hasRole = async (userId: string, guildId: string, roleId: string): Promise<boolean> => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return false;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return false;

            return member.roles.cache.has(roleId);
        } catch (error) {
            client.logger.error(`[TICKET_PERMISSIONS] Error checking role: ${error}`);
            return false;
        }
    };

    /**
     * Check if a user is a support member (has support role or admin permissions)
     * @param userId - Discord user ID
     * @param guildId - Discord guild ID
     * @param supportRoleId - Support role ID (optional)
     * @returns Promise resolving to whether user is support member
     */
    public isSupportMember = async (userId: string, guildId: string, supportRoleId?: string): Promise<boolean> => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return false;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return false;

            if (member.permissions.has(discord.PermissionFlagsBits.Administrator)) {
                return true;
            }

            if (member.permissions.has(discord.PermissionFlagsBits.ManageChannels)) {
                return true;
            }

            if (supportRoleId && member.roles.cache.has(supportRoleId)) {
                return true;
            }

            return false;
        } catch (error) {
            client.logger.error(`[TICKET_PERMISSIONS] Error checking support member status: ${error}`);
            return false;
        }
    };
}