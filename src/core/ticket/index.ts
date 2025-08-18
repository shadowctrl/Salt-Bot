import discord from 'discord.js';
import { DataSource } from 'typeorm';

import Formatter from '../../utils/format';
import { TicketRepository } from '../../events/database/repo/ticket_system';
import { CreateTicketOptions, CloseTicketOptions, TicketOperationResult, ITicket, ITicketStatus } from '../../types';

import { TicketUtils } from './utils';
import { TicketTranscript } from './transcript';
import { TicketPermissions } from './permissions';

export * from './utils';
export * from './permissions';
export * from './transcript';

/**
 * Main Ticket class that provides a unified interface for all ticket operations.
 * This class centralizes ticket management functionality and provides a clean API
 * for creating, managing, and interacting with support tickets.
 */
export class Ticket {
	private ticketRepo: TicketRepository;
	private client: discord.Client;
	private permissions: TicketPermissions;
	private utils: TicketUtils;
	private transcript: TicketTranscript;
	private ticketCooldowns = new Map<string, Map<string, number>>();
	private readonly COOLDOWN_DURATIONS = {
		CREATE: 30000,
		CLOSE: 10000,
		REOPEN: 15000,
		CLAIM: 5000,
		ARCHIVE: 10000,
		DELETE: 15000,
	};

	/**
	 * Creates a new Ticket instance
	 * @param dataSource - TypeORM DataSource connection
	 * @param client - Discord client instance
	 */
	constructor(dataSource: DataSource, client: discord.Client) {
		this.client = client;
		this.ticketRepo = new TicketRepository(dataSource);
		this.permissions = new TicketPermissions();
		this.utils = new TicketUtils(this.ticketRepo, client);
		this.transcript = new TicketTranscript(dataSource);
		setInterval(() => this.cleanupExpiredCooldowns(), 300000);
	}

	/**
	 * Check if a ticket is on cooldown for a specific action
	 * @param ticketId - Ticket ID to check
	 * @param action - Action type
	 * @returns Cooldown check result
	 */
	private checkTicketCooldown(ticketId: string, action: keyof typeof this.COOLDOWN_DURATIONS): { onCooldown: boolean; remainingTime?: number } {
		const ticketCooldownMap = this.ticketCooldowns.get(ticketId);
		if (!ticketCooldownMap) return { onCooldown: false };
		const createTime = ticketCooldownMap.get('CREATE');
		if (createTime && action !== 'CREATE') {
			const timeSinceCreate = Date.now() - createTime;
			if (timeSinceCreate < this.COOLDOWN_DURATIONS.CREATE) {
				const remainingTime = this.COOLDOWN_DURATIONS.CREATE - timeSinceCreate;
				return { onCooldown: true, remainingTime };
			}
		}

		const lastAction = ticketCooldownMap.get(action);
		const cooldownDuration = this.COOLDOWN_DURATIONS[action];
		const now = Date.now();

		if (lastAction && now - lastAction < cooldownDuration) {
			const remainingTime = cooldownDuration - (now - lastAction);
			return { onCooldown: true, remainingTime };
		}

		return { onCooldown: false };
	}

	/**
	 * Set cooldown for a ticket action
	 * @param ticketId - Ticket ID
	 * @param action - Action type
	 */
	private setTicketCooldown(ticketId: string, action: keyof typeof this.COOLDOWN_DURATIONS): void {
		if (!this.ticketCooldowns.has(ticketId)) this.ticketCooldowns.set(ticketId, new Map());
		const ticketCooldownMap = this.ticketCooldowns.get(ticketId)!;
		ticketCooldownMap.set(action, Date.now());
	}

	/**
	 * Clean up expired cooldowns to prevent memory leaks
	 */
	private cleanupExpiredCooldowns(): void {
		const now = Date.now();
		const maxCooldownDuration = Math.max(...Object.values(this.COOLDOWN_DURATIONS));

		for (const [ticketId, actionMap] of this.ticketCooldowns.entries()) {
			for (const [action, timestamp] of actionMap.entries()) {
				if (now - timestamp > maxCooldownDuration) actionMap.delete(action);
			}
			if (actionMap.size === 0) this.ticketCooldowns.delete(ticketId);
		}
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
					return { success: false, message: `You already have an open ticket: ${ticketChannel}`, ticket: existingTicket };
				} else {
					await this.ticketRepo.updateTicketStatus(existingTicket.id, ITicketStatus.CLOSED, 'system', 'Ticket channel was deleted');
				}
			}
			const category = await this.ticketRepo.getTicketCategory(options.categoryId);
			if (!category) return { success: false, message: 'Selected ticket category not found.' };
			const guild = this.client.guilds.cache.get(options.guildId);
			if (!guild) return { success: false, message: 'Guild not found.' };
			const channelResult = await this.utils.createTicketChannel(guild, category, options.userId);
			if (!channelResult.success || !channelResult.channel) return { success: false, message: channelResult.message || 'Failed to create ticket channel.' };
			const ticket = await this.ticketRepo.createTicket(options.guildId, options.userId, channelResult.channel.id, options.categoryId);
			const channelName = `ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`;

			await channelResult.channel.setName(channelName);
			await this.utils.setupChannelPermissions(channelResult.channel, category, options.userId);
			await this.utils.sendWelcomeMessage(channelResult.channel, ticket, category, options.userId);

			this.setTicketCooldown(ticket.id, 'CREATE');
			this.client.logger.info(`[TICKET] User ${options.userId} created ticket #${ticket.ticketNumber} in category ${category.name}`);

			return { success: true, message: `Ticket #${ticket.ticketNumber} created successfully!`, ticket, channel: channelResult.channel };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error creating ticket: ${error}`);
			return { success: false, message: 'An error occurred while creating the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			if (ticket.status !== 'open') return { success: false, message: 'This ticket is already closed.' };
			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(options.userId, ticket, 'close', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to close this ticket." };
			}
			const cooldownCheck = this.checkTicketCooldown(ticket.id, 'CLOSE');
			if (cooldownCheck.onCooldown) return { success: false, message: `Please wait ${Formatter.msToTime(cooldownCheck.remainingTime!)} before performing this action on the ticket.` };

			await this.ticketRepo.updateTicketStatus(ticket.id, ITicketStatus.CLOSED, options.userId, options.reason);
			const channel = this.client.channels.cache.get(options.channelId) as discord.TextChannel;
			if (channel) {
				await this.utils.sendCloseMessage(channel, ticket, options.userId, options.reason);
				await this.utils.updateChannelPermissionsForClosure(channel, ticket);
				if (options.generateTranscript !== false) {
					try {
						const user = await this.client.users.fetch(options.userId);
						await this.transcript.createAndSendTranscript(options.channelId, user, options.reason || 'No reason provided', ticket.id);
					} catch (transcriptError) {
						this.client.logger.error(`[TICKET] Error creating transcript: ${transcriptError}`);
					}
				}
			}

			await channel.setName(`closed-ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`);
			this.setTicketCooldown(ticket.id, 'CLOSE');
			this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} closed by ${options.userId}`);
			return { success: true, message: 'Ticket closed successfully.', ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error closing ticket: ${error}`);
			return { success: false, message: 'An error occurred while closing the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			if (ticket.status === 'open') return { success: false, message: 'This ticket is already open.' };
			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(userId, ticket, 'close', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to reopen this ticket." };
			}

			const cooldownCheck = this.checkTicketCooldown(ticket.id, 'REOPEN');
			if (cooldownCheck.onCooldown) return { success: false, message: `Please wait ${Formatter.msToTime(cooldownCheck.remainingTime!)} before performing this action on the ticket.` };

			await this.ticketRepo.updateTicketStatus(ticket.id, ITicketStatus.OPEN);
			const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
			if (channel) {
				await this.utils.sendReopenMessage(channel, ticket, userId);
				await this.utils.updateChannelPermissionsForReopen(channel, ticket);
			}
			await channel.setName(`ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`);
			this.setTicketCooldown(ticket.id, 'REOPEN');
			this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} reopened by ${userId}`);
			return { success: true, message: 'Ticket reopened successfully.', ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error reopening ticket: ${error}`);
			return { success: false, message: 'An error occurred while reopening the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(userId, ticket, 'claim', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to claim tickets. Only support team members can claim tickets." };
			}

			const cooldownCheck = this.checkTicketCooldown(ticket.id, 'CLAIM');
			if (cooldownCheck.onCooldown) return { success: false, message: `Please wait ${Formatter.msToTime(cooldownCheck.remainingTime!)} before performing another claim action on this ticket.` };

			if (ticket.claimedById) {
				if (ticket.claimedById === userId) {
					await this.ticketRepo.unclaimTicket(ticket.id);
					const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
					if (channel) await this.utils.sendUnclaimMessage(channel, ticket, userId);
					this.setTicketCooldown(ticket.id, 'CLAIM');
					return { success: true, message: 'Ticket unclaimed successfully.', ticket };
				} else {
					const claimer = await this.client.users.fetch(ticket.claimedById).catch(() => null);
					return { success: false, message: `This ticket is already claimed by ${claimer ? claimer.tag : 'someone else'}.` };
				}
			}

			await this.ticketRepo.claimTicket(ticket.id, userId);
			const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
			if (channel) await this.utils.sendClaimMessage(channel, ticket, userId);

			this.setTicketCooldown(ticket.id, 'CLAIM');
			this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} claimed by ${userId}`);
			return { success: true, message: 'Ticket claimed successfully.', ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error claiming ticket: ${error}`);
			return { success: false, message: 'An error occurred while claiming the ticket.' };
		}
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			if (ticket.status === 'archived') return { success: false, message: 'This ticket is already archived.' };

			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(userId, ticket, 'archive', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to archive tickets. Only support team members can archive tickets." };
			}

			const cooldownCheck = this.checkTicketCooldown(ticket.id, 'ARCHIVE');
			if (cooldownCheck.onCooldown) return { success: false, message: `Please wait ${Formatter.msToTime(cooldownCheck.remainingTime!)} before performing another archive action on this ticket.` };

			await this.ticketRepo.updateTicketStatus(ticket.id, ITicketStatus.ARCHIVED, userId, reason || 'Ticket archived');
			const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
			if (channel) {
				await this.utils.sendArchiveMessage(channel, ticket, userId);
				await this.utils.updateChannelPermissionsForArchive(channel, ticket);
			}

			await channel.setName(`archived-ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`);
			this.setTicketCooldown(ticket.id, 'ARCHIVE');
			this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} archived by ${userId}`);
			return { success: true, message: 'Ticket archived successfully.', ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error archiving ticket: ${error}`);
			return { success: false, message: 'An error occurred while archiving the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };

			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(userId, ticket, 'delete', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You need the 'Manage Channels' permission to delete tickets." };
			}

			const cooldownCheck = this.checkTicketCooldown(ticket.id, 'DELETE');
			if (cooldownCheck.onCooldown) return { success: false, message: `Please wait ${Formatter.msToTime(cooldownCheck.remainingTime!)} before performing another delete action on this ticket.` };

			await this.ticketRepo.updateTicketStatus(ticket.id, ITicketStatus.CLOSED, userId, reason || 'Ticket deleted by staff');
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
						this.ticketCooldowns.delete(ticket.id);
					} catch (deleteError) {
						this.client.logger.error(`[TICKET] Error deleting channel: ${deleteError}`);
					}
				}, 3000);
			}

			this.setTicketCooldown(ticket.id, 'DELETE');
			this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} deleted by ${userId}`);
			return { success: true, message: 'Ticket deleted successfully.', ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error deleting ticket: ${error}`);
			return { success: false, message: 'An error occurred while deleting the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(requesterId, ticket, 'add_user', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to manage users in this ticket." };
			}

			const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
			if (!channel) return { success: false, message: 'Channel not found.' };
			const targetUser = await this.client.users.fetch(targetUserId).catch(() => null);
			if (!targetUser) return { success: false, message: 'User not found.' };
			if (targetUser.bot) return { success: false, message: 'Cannot add bots to tickets.' };

			const permissions = channel.permissionsFor(targetUserId);
			if (permissions?.has(discord.PermissionFlagsBits.ViewChannel)) return { success: false, message: `${targetUser.tag} already has access to this ticket.` };
			await channel.permissionOverwrites.create(targetUserId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
			await this.utils.sendUserAddedMessage(channel, ticket, targetUser, requesterId);

			this.client.logger.info(`[TICKET] User ${targetUser.tag} added to ticket #${ticket.ticketNumber} by ${requesterId}`);
			return { success: true, message: `${targetUser.tag} has been added to the ticket.`, ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error adding user to ticket: ${error}`);
			return { success: false, message: 'An error occurred while adding the user to the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			if (targetUserId === ticket.creatorId) return { success: false, message: 'Cannot remove the ticket creator from the ticket.' };

			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(requesterId, ticket, 'remove_user', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to manage users in this ticket." };
			}

			const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
			if (!channel) return { success: false, message: 'Channel not found.' };
			const targetUser = await this.client.users.fetch(targetUserId).catch(() => null);
			if (!targetUser) return { success: false, message: 'User not found.' };
			if (targetUser.bot && targetUserId !== this.client.user?.id) return { success: false, message: 'Cannot remove bots from tickets.' };

			const permissions = channel.permissionsFor(targetUserId);
			if (!permissions?.has(discord.PermissionFlagsBits.ViewChannel)) return { success: false, message: `${targetUser.tag} doesn't have access to this ticket.` };

			await channel.permissionOverwrites.delete(targetUserId);
			await this.utils.sendUserRemovedMessage(channel, ticket, targetUser, requesterId);
			this.client.logger.info(`[TICKET] User ${targetUser.tag} removed from ticket #${ticket.ticketNumber} by ${requesterId}`);

			return { success: true, message: `${targetUser.tag} has been removed from the ticket.`, ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error removing user from ticket: ${error}`);
			return { success: false, message: 'An error occurred while removing the user from the ticket.' };
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
			if (!ticket) return { success: false, message: 'This is not a valid ticket channel.' };
			if (newOwnerId === ticket.creatorId) return { success: false, message: 'User is already the ticket owner.' };

			const guild = this.client.guilds.cache.get(ticket.category.guildConfig.guildId);
			if (guild) {
				const permissionCheck = await this.permissions.checkTicketPermission(requesterId, ticket, 'transfer_ownership', guild.id);
				if (!permissionCheck.hasPermission) return { success: false, message: permissionCheck.reason || "You don't have permission to transfer ticket ownership. You need to be an administrator, the ticket creator, or have the support role." };
			}

			const newOwner = await this.client.users.fetch(newOwnerId).catch(() => null);
			if (!newOwner) return { success: false, message: 'User not found.' };
			if (newOwner.bot) return { success: false, message: 'Cannot transfer ticket ownership to a bot.' };
			const previousOwner = await this.client.users.fetch(ticket.creatorId).catch(() => null);
			await this.ticketRepo.updateTicketOwner(ticket.id, newOwnerId);
			const channel = this.client.channels.cache.get(channelId) as discord.TextChannel;
			if (channel) {
				await this.utils.setupOwnerPermissions(channel, newOwnerId);
				await this.utils.sendOwnershipTransferMessage(channel, ticket, previousOwner, newOwner, requesterId);
				await this.utils.updateChannelName(channel, ticket.ticketNumber, newOwner.username);
			}

			this.client.logger.info(`[TICKET] Ticket #${ticket.ticketNumber} ownership transferred from ${ticket.creatorId} to ${newOwnerId} by ${requesterId}`);
			return { success: true, message: `Ticket ownership transferred to ${newOwner.tag}.`, ticket };
		} catch (error) {
			this.client.logger.error(`[TICKET] Error transferring ticket ownership: ${error}`);
			return { success: false, message: 'An error occurred while transferring ticket ownership.' };
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
	public checkPermission = async (userId: string, ticket: ITicket, action: 'claim' | 'close' | 'add_user' | 'remove_user' | 'transfer_ownership', guildId: string): Promise<{ hasPermission: boolean; reason?: string }> => {
		return await this.permissions.checkTicketPermission(userId, ticket, action, guildId);
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
