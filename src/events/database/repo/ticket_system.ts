import client from "../../../salt";
import { Repository, DataSource } from "typeorm";
import {
    GuildConfig,
    TicketCategory,
    Ticket,
    TicketMessage,
    TicketButton,
    SelectMenuConfig
} from "../entities/ticket_system";
import {
    IGuildConfig,
    ITicketCategory,
    ITicket,
    ITicketStatus,
    ITicketMessage,
    ITicketButton,
    ISelectMenuConfig
} from "../../../types";

/**
 * Repository class for managing ticket system in PostgreSQL
 * Provides methods for creating, fetching, and updating ticket-related records
 * @class TicketRepository
 */
export class TicketRepository {
    private guildConfigRepo: Repository<GuildConfig>;
    private ticketCategoryRepo: Repository<TicketCategory>;
    private ticketRepo: Repository<Ticket>;
    private ticketMessageRepo: Repository<TicketMessage>;
    private ticketButtonRepo: Repository<TicketButton>;
    private selectMenuRepo: Repository<SelectMenuConfig>;
    private dataSource: DataSource;

    /**
     * Creates a new TicketRepository instance
     * @param dataSource - TypeORM DataSource connection
     */
    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.guildConfigRepo = dataSource.getRepository(GuildConfig);
        this.ticketCategoryRepo = dataSource.getRepository(TicketCategory);
        this.ticketRepo = dataSource.getRepository(Ticket);
        this.ticketMessageRepo = dataSource.getRepository(TicketMessage);
        this.ticketButtonRepo = dataSource.getRepository(TicketButton);
        this.selectMenuRepo = dataSource.getRepository(SelectMenuConfig);
    }

    // ============== GUILD CONFIG METHODS ==============

    /**
     * Gets or creates guild configuration
     * @param guildId - Discord guild ID
     * @returns Guild configuration
     */
    async getOrCreateGuildConfig(guildId: string): Promise<IGuildConfig> {
        try {
            // Try to find existing config
            let guildConfig = await this.guildConfigRepo.findOne({
                where: { guildId },
                relations: ['ticketCategories', 'ticketButton', 'selectMenu']
            });

            // Create new config if none exists
            if (!guildConfig) {
                guildConfig = new GuildConfig();
                guildConfig.guildId = guildId;
                guildConfig.defaultCategoryName = "tickets"; // Default value
                guildConfig.isEnabled = true;
                guildConfig = await this.guildConfigRepo.save(guildConfig);

                client.logger.info(`[TICKET_REPO] Created new guild config for ${guildId}`);
            }

            return guildConfig;
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting guild config: ${error}`);
            throw error;
        }
    }

    /**
     * Gets guild configuration
     * @param guildId - Discord guild ID
     * @returns Guild configuration or null if not found
     */
    async getGuildConfig(guildId: string): Promise<IGuildConfig | null> {
        try {
            return await this.guildConfigRepo.findOne({
                where: { guildId },
                relations: ['ticketCategories', 'ticketButton', 'selectMenu']
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting guild config: ${error}`);
            return null;
        }
    }

    /**
     * Updates guild configuration
     * @param guildId - Discord guild ID
     * @param configData - Guild configuration data
     * @returns Updated guild configuration
     */
    async updateGuildConfig(
        guildId: string,
        configData: {
            defaultCategoryName?: string;
            isEnabled?: boolean;
        }
    ): Promise<IGuildConfig | null> {
        try {
            const guildConfig = await this.getOrCreateGuildConfig(guildId);

            if (configData.defaultCategoryName !== undefined) {
                guildConfig.defaultCategoryName = configData.defaultCategoryName;
            }

            if (configData.isEnabled !== undefined) {
                guildConfig.isEnabled = configData.isEnabled;
            }

            return await this.guildConfigRepo.save(guildConfig as GuildConfig);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error updating guild config: ${error}`);
            return null;
        }
    }

    /**
     * Deletes guild configuration and all related entities
     * @param guildId - Discord guild ID
     * @returns True if deletion was successful, false otherwise
     */
    async deleteGuildConfig(guildId: string): Promise<boolean> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const guildConfig = await this.getGuildConfig(guildId);

            if (!guildConfig) {
                return false;
            }

            await this.guildConfigRepo.remove(guildConfig as GuildConfig);
            await queryRunner.commitTransaction();

            return true;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[TICKET_REPO] Error deleting guild config: ${error}`);
            return false;
        } finally {
            await queryRunner.release();
        }
    }

    // ============== TICKET CATEGORY METHODS ==============

    /**
     * Creates a new ticket category
     * @param guildId - Discord guild ID
     * @param categoryData - Ticket category data
     * @returns Created ticket category
     */
    async createTicketCategory(
        guildId: string,
        categoryData: {
            name: string;
            description?: string;
            emoji?: string;
            supportRoleId?: string;
            position?: number;
        }
    ): Promise<ITicketCategory> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const guildConfig = await this.getOrCreateGuildConfig(guildId);

            const category = new TicketCategory();
            category.name = categoryData.name;
            category.description = categoryData.description;
            category.emoji = categoryData.emoji;
            category.supportRoleId = categoryData.supportRoleId;
            category.position = categoryData.position || 0;
            category.guildConfig = guildConfig as GuildConfig;

            const savedCategory = await this.ticketCategoryRepo.save(category);

            // Create default welcome message for this category
            const ticketMessage = new TicketMessage();
            ticketMessage.category = savedCategory;
            ticketMessage.welcomeMessage = `Welcome to your ticket in the ${savedCategory.name} category!`;
            ticketMessage.closeMessage = `This ticket in the ${savedCategory.name} category has been closed.`;
            ticketMessage.includeSupportTeam = true;
            await this.ticketMessageRepo.save(ticketMessage);

            await queryRunner.commitTransaction();
            return savedCategory;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[TICKET_REPO] Error creating ticket category: ${error}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Gets a ticket category by ID
     * @param categoryId - Category ID
     * @returns Ticket category or null if not found
     */
    async getTicketCategory(categoryId: string): Promise<ITicketCategory | null> {
        try {
            return await this.ticketCategoryRepo.findOne({
                where: { id: categoryId },
                relations: ['guildConfig', 'ticketMessage']
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting ticket category: ${error}`);
            return null;
        }
    }

    /**
     * Gets all ticket categories for a guild
     * @param guildId - Discord guild ID
     * @returns Array of ticket categories
     */
    async getTicketCategories(guildId: string): Promise<ITicketCategory[]> {
        try {
            const guildConfig = await this.guildConfigRepo.findOne({
                where: { guildId },
                relations: ['ticketCategories', 'ticketCategories.ticketMessage']
            });

            if (!guildConfig) {
                return [];
            }

            // Sort categories by position for consistent display order
            return guildConfig.ticketCategories.sort((a, b) => a.position - b.position);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting ticket categories: ${error}`);
            return [];
        }
    }

    /**
     * Updates a ticket category
     * @param categoryId - Category ID
     * @param categoryData - Ticket category data to update
     * @returns Updated ticket category
     */
    async updateTicketCategory(
        categoryId: string,
        categoryData: {
            name?: string;
            description?: string;
            emoji?: string;
            supportRoleId?: string;
            position?: number;
            isEnabled?: boolean;
        }
    ): Promise<ITicketCategory | null> {
        try {
            const category = await this.getTicketCategory(categoryId);

            if (!category) {
                return null;
            }

            // Update fields if provided
            if (categoryData.name !== undefined) category.name = categoryData.name;
            if (categoryData.description !== undefined) category.description = categoryData.description;
            if (categoryData.emoji !== undefined) category.emoji = categoryData.emoji;
            if (categoryData.supportRoleId !== undefined) category.supportRoleId = categoryData.supportRoleId;
            if (categoryData.position !== undefined) category.position = categoryData.position;
            if (categoryData.isEnabled !== undefined) category.isEnabled = categoryData.isEnabled;

            return await this.ticketCategoryRepo.save(category as TicketCategory);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error updating ticket category: ${error}`);
            return null;
        }
    }

    /**
     * Deletes a ticket category
     * @param categoryId - Category ID
     * @returns True if deletion was successful, false otherwise
     */
    async deleteTicketCategory(categoryId: string): Promise<boolean> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const category = await this.getTicketCategory(categoryId);

            if (!category) {
                return false;
            }

            await this.ticketCategoryRepo.remove(category as TicketCategory);
            await queryRunner.commitTransaction();

            return true;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[TICKET_REPO] Error deleting ticket category: ${error}`);
            return false;
        } finally {
            await queryRunner.release();
        }
    }

    // ============== TICKET METHODS ==============

    /**
     * Creates a new ticket
     * @param guildId - Discord guild ID
     * @param creatorId - ID of the user creating the ticket
     * @param channelId - ID of the created ticket channel
     * @param categoryId - ID of the ticket category
     * @returns Created ticket
     */
    async createTicket(
        guildId: string,
        creatorId: string,
        channelId: string,
        categoryId: string
    ): Promise<ITicket> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Find the specified category
            const category = await this.ticketCategoryRepo.findOne({
                where: { id: categoryId },
                relations: ['guildConfig', 'ticketMessage']
            });

            if (!category || category.guildConfig.guildId !== guildId) {
                throw new Error("Ticket category not found or does not belong to this guild");
            }

            // Increment the ticket counter for this category
            category.ticketCount++;
            await this.ticketCategoryRepo.save(category);

            // Create the ticket
            const ticket = new Ticket();
            ticket.ticketNumber = category.ticketCount;
            ticket.channelId = channelId;
            ticket.creatorId = creatorId;
            ticket.status = ITicketStatus.OPEN;
            ticket.category = category;

            const savedTicket = await this.ticketRepo.save(ticket);

            await queryRunner.commitTransaction();
            return savedTicket;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[TICKET_REPO] Error creating ticket: ${error}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Gets a ticket by ID
     * @param ticketId - Ticket ID
     * @returns Ticket or null if not found
     */
    async getTicket(ticketId: string): Promise<ITicket | null> {
        try {
            return await this.ticketRepo.findOne({
                where: { id: ticketId },
                relations: ['category', 'category.ticketMessage']
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting ticket: ${error}`);
            return null;
        }
    }

    /**
     * Gets a ticket by its channel ID
     * @param channelId - Discord channel ID
     * @returns Ticket or null if not found
     */
    async getTicketByChannelId(channelId: string): Promise<ITicket | null> {
        try {
            return await this.ticketRepo.findOne({
                where: { channelId },
                relations: ['category', 'category.ticketMessage']
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting ticket by channel ID: ${error}`);
            return null;
        }
    }

    /**
     * Gets all tickets for a guild
     * @param guildId - Discord guild ID
     * @returns Array of tickets
     */
    async getGuildTickets(guildId: string): Promise<ITicket[]> {
        try {
            // Get all categories for this guild
            const categories = await this.getTicketCategories(guildId);

            if (categories.length === 0) {
                return [];
            }

            // Get category IDs
            const categoryIds = categories.map(cat => cat.id);

            // Get tickets for these categories
            return await this.ticketRepo.find({
                where: {
                    category: {
                        id: categoryIds.length === 1 ? categoryIds[0] : { $in: categoryIds } as any
                    }
                },
                relations: ['category']
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting guild tickets: ${error}`);
            return [];
        }
    }

    /**
     * Gets all tickets for a specific category
     * @param categoryId - Category ID
     * @returns Array of tickets
     */
    async getCategoryTickets(categoryId: string): Promise<ITicket[]> {
        try {
            return await this.ticketRepo.find({
                where: { category: { id: categoryId } },
                relations: ['category']
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting category tickets: ${error}`);
            return [];
        }
    }

    /**
     * Updates a ticket's status
     * @param ticketId - Ticket ID
     * @param status - New ticket status
     * @param userId - ID of the user closing/archiving the ticket (if applicable)
     * @param reason - Reason for closing/archiving (if applicable)
     * @returns Updated ticket
     */
    async updateTicketStatus(
        ticketId: string,
        status: ITicketStatus,
        userId?: string,
        reason?: string
    ): Promise<ITicket | null> {
        try {
            const ticket = await this.ticketRepo.findOne({
                where: { id: ticketId }
            });

            if (!ticket) {
                return null;
            }

            ticket.status = status;

            if (status === ITicketStatus.CLOSED || status === ITicketStatus.ARCHIVED) {
                ticket.closedById = userId;
                ticket.closedAt = new Date();
                ticket.closeReason = reason;
            }

            return await this.ticketRepo.save(ticket);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error updating ticket status: ${error}`);
            return null;
        }
    }

    /**
     * Deletes a ticket
     * @param ticketId - Ticket ID 
     * @returns True if deletion was successful, false otherwise
     */
    async deleteTicket(ticketId: string): Promise<boolean> {
        try {
            const ticket = await this.getTicket(ticketId);

            if (!ticket) {
                return false;
            }

            await this.ticketRepo.remove(ticket as Ticket);
            return true;
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error deleting ticket: ${error}`);
            return false;
        }
    }

    // ============== TICKET MESSAGE METHODS ==============

    /**
     * Gets ticket message configuration for a category
     * @param categoryId - Category ID
     * @returns Ticket message configuration
     */
    async getTicketMessage(categoryId: string): Promise<ITicketMessage | null> {
        try {
            return await this.ticketMessageRepo.findOne({
                where: { category: { id: categoryId } }
            });
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting ticket message: ${error}`);
            return null;
        }
    }

    /**
     * Configures ticket messages for a specific category
     * @param categoryId - ID of the ticket category
     * @param messageData - Message configuration data
     * @returns Configured ticket messages
     */
    async configureTicketMessages(
        categoryId: string,
        messageData: {
            welcomeMessage?: string;
            closeMessage?: string;
            includeSupportTeam?: boolean;
        }
    ): Promise<ITicketMessage | null> {
        try {
            const category = await this.ticketCategoryRepo.findOne({
                where: { id: categoryId },
                relations: ['ticketMessage']
            });

            if (!category) {
                client.logger.error(`[TICKET_REPO] Category not found: ${categoryId}`);
                return null;
            }

            // Find existing message config or create new one
            let messageConfig = category.ticketMessage;

            if (!messageConfig) {
                messageConfig = new TicketMessage();
                messageConfig.category = category;
                messageConfig.welcomeMessage = `Welcome to your ticket in the ${category.name} category!`;
                messageConfig.closeMessage = `This ticket in the ${category.name} category has been closed.`;
                messageConfig.includeSupportTeam = true;
            }

            // Update fields if provided
            if (messageData.welcomeMessage !== undefined) messageConfig.welcomeMessage = messageData.welcomeMessage;
            if (messageData.closeMessage !== undefined) messageConfig.closeMessage = messageData.closeMessage;
            if (messageData.includeSupportTeam !== undefined) messageConfig.includeSupportTeam = messageData.includeSupportTeam;

            return await this.ticketMessageRepo.save(messageConfig);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error configuring ticket messages: ${error}`);
            return null;
        }
    }

    // ============== TICKET BUTTON METHODS ==============

    /**
     * Configures the initial ticket button 
     * @param guildId - Discord guild ID
     * @param buttonData - Button configuration data
     * @returns Configured ticket button
     */
    async configureTicketButton(
        guildId: string,
        buttonData: {
            label?: string;
            emoji?: string;
            style?: string;
            messageId?: string;
            channelId?: string;
            embedTitle?: string;
            embedDescription?: string;
            embedColor?: string;
        }
    ): Promise<ITicketButton | null> {
        try {
            const guildConfig = await this.getOrCreateGuildConfig(guildId);

            // Find existing button config or create new one
            let buttonConfig = await this.ticketButtonRepo.findOne({
                where: { guildConfig: { id: guildConfig.id } }
            });

            if (!buttonConfig) {
                buttonConfig = new TicketButton();
                buttonConfig.guildConfig = guildConfig as GuildConfig;
            }

            // Update fields if provided
            if (buttonData.label !== undefined) buttonConfig.label = buttonData.label;
            if (buttonData.emoji !== undefined) buttonConfig.emoji = buttonData.emoji;
            if (buttonData.style !== undefined) buttonConfig.style = buttonData.style;
            if (buttonData.messageId !== undefined) buttonConfig.messageId = buttonData.messageId;
            if (buttonData.channelId !== undefined) buttonConfig.channelId = buttonData.channelId;
            if (buttonData.embedTitle !== undefined) buttonConfig.embedTitle = buttonData.embedTitle;
            if (buttonData.embedDescription !== undefined) buttonConfig.embedDescription = buttonData.embedDescription;
            if (buttonData.embedColor !== undefined) buttonConfig.embedColor = buttonData.embedColor;

            return await this.ticketButtonRepo.save(buttonConfig);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error configuring ticket button: ${error}`);
            return null;
        }
    }

    /**
     * Gets ticket button configuration for a guild
     * @param guildId - Discord guild ID
     * @returns Ticket button configuration or null if not found
     */
    async getTicketButtonConfig(guildId: string): Promise<ITicketButton | null> {
        try {
            const guildConfig = await this.guildConfigRepo.findOne({
                where: { guildId },
                relations: ['ticketButton']
            });

            return guildConfig?.ticketButton || null;
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting ticket button config: ${error}`);
            return null;
        }
    }

    // ============== SELECT MENU METHODS ==============

    /**
     * Configures the select menu for choosing ticket categories
     * @param guildId - Discord guild ID
     * @param menuData - Select menu configuration data
     * @returns Configured select menu
     */
    async configureSelectMenu(
        guildId: string,
        menuData: {
            placeholder?: string;
            messageId?: string;
            minValues?: number;
            maxValues?: number;
            embedTitle?: string;
            embedDescription?: string;
            embedColor?: string;
        }
    ): Promise<ISelectMenuConfig | null> {
        try {
            const guildConfig = await this.getOrCreateGuildConfig(guildId);

            // Find existing menu config or create new one
            let menuConfig = await this.selectMenuRepo.findOne({
                where: { guildConfig: { id: guildConfig.id } }
            });

            if (!menuConfig) {
                menuConfig = new SelectMenuConfig();
                menuConfig.guildConfig = guildConfig as GuildConfig;
            }

            // Update fields if provided
            if (menuData.placeholder !== undefined) menuConfig.placeholder = menuData.placeholder;
            if (menuData.messageId !== undefined) menuConfig.messageId = menuData.messageId;
            if (menuData.minValues !== undefined) menuConfig.minValues = menuData.minValues;
            if (menuData.maxValues !== undefined) menuConfig.maxValues = menuData.maxValues;
            if (menuData.embedTitle !== undefined) menuConfig.embedTitle = menuData.embedTitle;
            if (menuData.embedDescription !== undefined) menuConfig.embedDescription = menuData.embedDescription;
            if (menuData.embedColor !== undefined) menuConfig.embedColor = menuData.embedColor;

            return await this.selectMenuRepo.save(menuConfig);
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error configuring select menu: ${error}`);
            return null;
        }
    }

    /**
     * Gets the select menu configuration for a guild
     * @param guildId - Discord guild ID
     * @returns Select menu configuration or null if not found
     */
    async getSelectMenuConfig(guildId: string): Promise<ISelectMenuConfig | null> {
        try {
            const guildConfig = await this.guildConfigRepo.findOne({
                where: { guildId },
                relations: ['selectMenu']
            });

            return guildConfig?.selectMenu || null;
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting select menu config: ${error}`);
            return null;
        }
    }

    // ============== STATISTICS METHODS ==============

    /**
     * Gets ticket statistics for a guild
     * @param guildId - Discord guild ID
     * @returns Ticket statistics object
     */
    async getGuildTicketStats(guildId: string): Promise<{
        totalTickets: number;
        openTickets: number;
        closedTickets: number;
        archivedTickets: number;
        categoryCounts: Record<string, number>;
    }> {
        try {
            const tickets = await this.getGuildTickets(guildId);
            const categories = await this.getTicketCategories(guildId);

            const stats = {
                totalTickets: tickets.length,
                openTickets: tickets.filter(t => t.status === ITicketStatus.OPEN).length,
                closedTickets: tickets.filter(t => t.status === ITicketStatus.CLOSED).length,
                archivedTickets: tickets.filter(t => t.status === ITicketStatus.ARCHIVED).length,
                categoryCounts: {} as Record<string, number>
            };

            // Initialize category counts
            categories.forEach(category => {
                stats.categoryCounts[category.name] = 0;
            });

            // Count tickets per category
            tickets.forEach(ticket => {
                const categoryName = ticket.category.name;
                if (stats.categoryCounts[categoryName] !== undefined) {
                    stats.categoryCounts[categoryName]++;
                } else {
                    stats.categoryCounts[categoryName] = 1;
                }
            });

            return stats;
        } catch (error) {
            client.logger.error(`[TICKET_REPO] Error getting guild ticket stats: ${error}`);
            return {
                totalTickets: 0,
                openTickets: 0,
                closedTickets: 0,
                archivedTickets: 0,
                categoryCounts: {}
            };
        }
    }
}