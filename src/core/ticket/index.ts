import discord from "discord.js";
import { DataSource } from "typeorm";
import { TicketUtils } from "./utils";
import { ITicket } from "../../types";
import { TicketPermissions } from "./permissions";
import { TicketTranscript } from "./transcript";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../events/database/entities/ticket_system";
import { CreateTicketOptions, CloseTicketOptions, TicketOperationResult } from "./types";

export * from './types';
export { TicketUtils } from './utils'
export { TicketPermissions } from './permissions';
export type {
    CreateTicketOptions,
    CloseTicketOptions,
    TicketOperationResult,
    ChannelCreationResult,
    PermissionCheckResult,
    TicketAction
} from './types';
export type { ITicket, ITicketCategory } from '../../types';

/**
 * Main Ticket class that provides a unified interface for all ticket operations.
 * This class centralizes ticket management functionality and provides a clean API
 * for creating, managing, and interacting with support tickets.
 */
export class Ticket {
    private ticketRepo: TicketRepository;
    private dataSource: DataSource;
    private client: discord.Client;
    private permissions: TicketPermissions;
    private utils: TicketUtils;
    private transcript: TicketTranscript;

    /**
     * Creates a new Ticket instance
     * @param dataSource - TypeORM DataSource connection
     * @param client - Discord client instance
     */
    constructor(dataSource: DataSource, client: discord.Client) {
        this.dataSource = dataSource;
        this.client = client;
        this.ticketRepo = new TicketRepository(dataSource);
        this.permissions = new TicketPermissions(this.ticketRepo);
        this.utils = new TicketUtils(this.ticketRepo, client);
        this.transcript = new TicketTranscript(dataSource);
    }

    /**
     * Create a new ticket for a user
     * @param options - Ticket creation options
     * @returns Promise resolving to operation result
     */
    public create = async (options: CreateTicketOptions): Promise<TicketOperationResult> => {
        try {
            const existingTicket = await this.utils.getUserOpenTicket(options.guildId, options.userId);
            if (existingTicket) {
                const ticketChannel = this.client.channels.cache.get(existingTicket.channelId) as discord.TextChannel;
                if (ticketChannel) {
                    return {
                        success: false,
                        message: `You already have an open ticket: ${ticketChannel}`,
                        ticket: existingTicket
                    };
                } else {
                    await this.ticketRepo.updateTicketStatus(
                        existingTicket.id,
                        ITicketStatus.CLOSED,
                        "system",
                        "Ticket channel was deleted"
                    );
                }
            }

            const category = await this.ticketRepo.getTicketCategory(options.categoryId);
            if (!category) {
                return {
                    success: false,
                    message: "Selected ticket category not found."
                };
            }

            const guild = this.client.guilds.cache.get(options.guildId);
            if (!guild) {
                return {
                    success: false,
                    message: "Guild not found."
                };
            }

            const channelResult = await this.utils.createTicketChannel(guild, category, options.userId);
            if (!channelResult.success || !channelResult.channel) {
                return {
                    success: false,
                    message: channelResult.message || "Failed to create ticket channel."
                };
            }

            const ticket = await this.ticketRepo.createTicket(
                options.guildId,
                options.userId,
                channelResult.channel.id,
                options.categoryId
            );

            const channelName = `ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`;
            await channelResult.channel.setName(channelName);
            await this.utils.setupChannelPermissions(channelResult.channel, category, options.userId);
            await this.utils.sendWelcomeMessage(channelResult.channel, ticket, category, options.userId);

            this.client.logger.info(`[TICKET] User ${options.userId} created ticket #${ticket.ticketNumber} in category ${category.name}`);

            return {
                success: true,
                message: `Ticket #${ticket.ticketNumber} created successfully!`,
                ticket,
                channel: channelResult.channel
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error creating ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while creating the ticket."
            };
        }
    };

    /**
     * Close an existing ticket
     * @param options - Ticket closing options
     * @returns Promise resolving to operation result
     */
    public close = async (options: CloseTicketOptions): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(options.channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            if (ticket.status !== "open") {
                return {
                    success: false,
                    message: "This ticket is already closed."
                };
            }

            await this.ticketRepo.updateTicketStatus(
                ticket.id,
                ITicketStatus.CLOSED,
                options.userId,
                options.reason
            );

            const channel = this.client.channels.cache.get(options.channelId) as discord.TextChannel;
            if (channel) {
                await this.utils.sendCloseMessage(channel, ticket, options.userId, options.reason);
                await this.utils.updateChannelPermissionsForClosure(channel);

                if (options.generateTranscript !== false) {
                    try {
                        const user = await this.client.users.fetch(options.userId);
                        await this.transcript.createAndSendTranscript(
                            options.channelId,
                            user,
                            options.reason || "No reason provided",
                            ticket.id
                        );
                    } catch (transcriptError) {
                        this.client.logger.error(`[TICKET] Error creating transcript: ${transcriptError}`);
                    }
                }
            }

            this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} closed by ${options.userId}`);

            return {
                success: true,
                message: "Ticket closed successfully.",
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error closing ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while closing the ticket."
            };
        }
    };

    /**
     * Reopen a closed ticket
     * @param channelId - Discord channel ID
     * @param userId - User ID who is reopening the ticket
     * @returns Promise resolving to operation result
     */
    public reopen = async (channelId: string, userId: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            if (ticket.status === "open") {
                return {
                    success: false,
                    message: "This ticket is already open."
                };
            }

            await this.ticketRepo.updateTicketStatus(ticket.id, ITicketStatus.OPEN);

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (channel) {
                await this.utils.sendReopenMessage(channel, ticket, userId);
                await this.utils.updateChannelPermissionsForReopen(channel, ticket);
            }

            this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} reopened by ${userId}`);

            return {
                success: true,
                message: "Ticket reopened successfully.",
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error reopening ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while reopening the ticket."
            };
        }
    };

    /**
     * Claim a ticket for a support agent
     * @param channelId - Discord channel ID
     * @param userId - User ID who is claiming the ticket
     * @returns Promise resolving to operation result
     */
    public claim = async (channelId: string, userId: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            if (ticket.claimedById) {
                if (ticket.claimedById === userId) {
                    await this.ticketRepo.unclaimTicket(ticket.id);

                    const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
                    if (channel) {
                        await this.utils.sendUnclaimMessage(channel, ticket, userId);
                    }

                    return {
                        success: true,
                        message: "Ticket unclaimed successfully.",
                        ticket
                    };
                } else {
                    const claimer = await this.client.users.fetch(ticket.claimedById).catch(() => null);
                    return {
                        success: false,
                        message: `This ticket is already claimed by ${claimer ? claimer.tag : "someone else"}.`
                    };
                }
            }

            await this.ticketRepo.claimTicket(ticket.id, userId);

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (channel) {
                await this.utils.sendClaimMessage(channel, ticket, userId);
            }

            this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} claimed by ${userId}`);

            return {
                success: true,
                message: "Ticket claimed successfully.",
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error claiming ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while claiming the ticket."
            };
        }
    };

    /**
     * Add a user to a ticket
     * @param channelId - Discord channel ID
     * @param targetUserId - User ID to add to the ticket
     * @param requesterId - User ID who is making the request
     * @returns Promise resolving to operation result
     */
    public addUser = async (channelId: string, targetUserId: string, requesterId: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (!channel) {
                return {
                    success: false,
                    message: "Channel not found."
                };
            }

            const targetUser = await this.client.users.fetch(targetUserId).catch(() => null);
            if (!targetUser) {
                return {
                    success: false,
                    message: "User not found."
                };
            }

            if (targetUser.bot) {
                return {
                    success: false,
                    message: "Cannot add bots to tickets."
                };
            }

            const permissions = channel.permissionsFor(targetUserId);
            if (permissions?.has(discord.PermissionFlagsBits.ViewChannel)) {
                return {
                    success: false,
                    message: `${targetUser.tag} already has access to this ticket.`
                };
            }

            await channel.permissionOverwrites.create(targetUserId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            await this.utils.sendUserAddedMessage(channel, ticket, targetUser, requesterId);

            this.client.logger.info(`[TICKET] User ${targetUser.tag} added to ticket #${ticket.ticketNumber} by ${requesterId}`);

            return {
                success: true,
                message: `${targetUser.tag} has been added to the ticket.`,
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error adding user to ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while adding the user to the ticket."
            };
        }
    };

    /**
     * Remove a user from a ticket
     * @param channelId - Discord channel ID
     * @param targetUserId - User ID to remove from the ticket
     * @param requesterId - User ID who is making the request
     * @returns Promise resolving to operation result
     */
    public removeUser = async (channelId: string, targetUserId: string, requesterId: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            if (targetUserId === ticket.creatorId) {
                return {
                    success: false,
                    message: "Cannot remove the ticket creator from the ticket."
                };
            }

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (!channel) {
                return {
                    success: false,
                    message: "Channel not found."
                };
            }

            const targetUser = await this.client.users.fetch(targetUserId).catch(() => null);
            if (!targetUser) {
                return {
                    success: false,
                    message: "User not found."
                };
            }

            if (targetUser.bot && targetUserId !== this.client.user?.id) {
                return {
                    success: false,
                    message: "Cannot remove bots from tickets."
                };
            }

            const permissions = channel.permissionsFor(targetUserId);
            if (!permissions?.has(discord.PermissionFlagsBits.ViewChannel)) {
                return {
                    success: false,
                    message: `${targetUser.tag} doesn't have access to this ticket.`
                };
            }

            await channel.permissionOverwrites.delete(targetUserId);
            await this.utils.sendUserRemovedMessage(channel, ticket, targetUser, requesterId);

            this.client.logger.info(`[TICKET] User ${targetUser.tag} removed from ticket #${ticket.ticketNumber} by ${requesterId}`);

            return {
                success: true,
                message: `${targetUser.tag} has been removed from the ticket.`,
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error removing user from ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while removing the user from the ticket."
            };
        }
    };

    /**
     * Transfer ticket ownership to another user
     * @param channelId - Discord channel ID
     * @param newOwnerId - User ID of the new owner
     * @param requesterId - User ID who is making the request
     * @returns Promise resolving to operation result
     */
    public transferOwnership = async (channelId: string, newOwnerId: string, requesterId: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            if (newOwnerId === ticket.creatorId) {
                return {
                    success: false,
                    message: "User is already the ticket owner."
                };
            }

            const newOwner = await this.client.users.fetch(newOwnerId).catch(() => null);
            if (!newOwner) {
                return {
                    success: false,
                    message: "User not found."
                };
            }

            if (newOwner.bot) {
                return {
                    success: false,
                    message: "Cannot transfer ticket ownership to a bot."
                };
            }

            const previousOwner = await this.client.users.fetch(ticket.creatorId).catch(() => null);
            await this.ticketRepo.updateTicketOwner(ticket.id, newOwnerId);

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (channel) {
                await this.utils.setupOwnerPermissions(channel, newOwnerId);
                await this.utils.sendOwnershipTransferMessage(channel, ticket, previousOwner, newOwner, requesterId);
                await this.utils.updateChannelName(channel, ticket.ticketNumber, newOwner.username);
            }

            this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} ownership transferred from ${ticket.creatorId} to ${newOwnerId} by ${requesterId}`);

            return {
                success: true,
                message: `Ticket ownership transferred to ${newOwner.tag}.`,
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error transferring ticket ownership: ${error}`);
            return {
                success: false,
                message: "An error occurred while transferring ticket ownership."
            };
        }
    };

    /**
     * Get ticket information
     * @param channelId - Discord channel ID
     * @returns Promise resolving to ticket information or null
     */
    public getInfo = async (channelId: string): Promise<ITicket | null> => {
        try {
            return await this.ticketRepo.getTicketByChannelId(channelId);
        } catch (error) {
            this.client.logger.error(`[TICKET] Error getting ticket info: ${error}`);
            return null;
        }
    };

    /**
     * Check if a user has permission to perform a ticket action
     * @param userId - User ID to check
     * @param ticket - Ticket to check permissions for
     * @param action - Action to check permission for
     * @param guildId - Guild ID for role checking
     * @returns Promise resolving to permission result
     */
    public checkPermission = async (
        userId: string,
        ticket: ITicket,
        action: 'claim' | 'close' | 'add_user' | 'remove_user' | 'transfer_ownership',
        guildId: string
    ): Promise<{ hasPermission: boolean; reason?: string }> => {
        return await this.permissions.checkTicketPermission(userId, ticket, action, guildId);
    };

    /**
     * Archive a ticket
     * @param channelId - Discord channel ID
     * @param userId - User ID who is archiving the ticket
     * @param reason - Reason for archiving
     * @returns Promise resolving to operation result
     */
    public archive = async (channelId: string, userId: string, reason?: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            if (ticket.status === "archived") {
                return {
                    success: false,
                    message: "This ticket is already archived."
                };
            }

            await this.ticketRepo.updateTicketStatus(
                ticket.id,
                ITicketStatus.ARCHIVED,
                userId,
                reason || "Ticket archived"
            );

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (channel) {
                await this.utils.sendArchiveMessage(channel, ticket, userId);
            }

            this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} archived by ${userId}`);

            return {
                success: true,
                message: "Ticket archived successfully.",
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error archiving ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while archiving the ticket."
            };
        }
    };

    /**
     * Delete a ticket (marks as closed and removes channel)
     * @param channelId - Discord channel ID
     * @param userId - User ID who is deleting the ticket
     * @param reason - Reason for deletion
     * @returns Promise resolving to operation result
     */
    public delete = async (channelId: string, userId: string, reason?: string): Promise<TicketOperationResult> => {
        try {
            const ticket = await this.ticketRepo.getTicketByChannelId(channelId);
            if (!ticket) {
                return {
                    success: false,
                    message: "This is not a valid ticket channel."
                };
            }

            await this.ticketRepo.updateTicketStatus(
                ticket.id,
                ITicketStatus.CLOSED,
                userId,
                reason || "Ticket deleted by staff"
            );

            const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
            if (channel) {
                try {
                    const creator = await this.client.users.fetch(ticket.creatorId);
                    await this.utils.sendDeletionNotification(creator, ticket);
                } catch (dmError) {
                    this.client.logger.warn(`[TICKET] Could not send DM to ticket creator: ${dmError}`);
                }

                setTimeout(async () => {
                    try {
                        await channel.delete();
                        this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} channel deleted by ${userId}`);
                    } catch (deleteError) {
                        this.client.logger.error(`[TICKET] Error deleting channel: ${deleteError}`);
                    }
                }, 3000);
            }

            this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} deleted by ${userId}`);

            return {
                success: true,
                message: "Ticket deleted successfully.",
                ticket
            };

        } catch (error) {
            this.client.logger.error(`[TICKET] Error deleting ticket: ${error}`);
            return {
                success: false,
                message: "An error occurred while deleting the ticket."
            };
        }
    };

    /**
     * Get ticket repository instance for advanced operations
     * @returns TicketRepository instance
     */
    public getRepository = (): TicketRepository => {
        return this.ticketRepo;
    };

    /**
     * Get transcript utility instance for advanced transcript operations
     * @returns TicketTranscript instance
     */
    public getTranscript = (): TicketTranscript => {
        return this.transcript;
    };
}