import discord from "discord.js";
import { DataSource } from "typeorm";
import { ConfigManager } from "../../../utils/config";
import { BotEvent } from "../../../types";

// Load entities
import { UserData } from "../entities/user_data";
import { PremiumCoupon } from "../entities/premium_coupons";
import { BlockedUser, BlockReason } from "../entities/blocked_users";
import { GuildConfig, SelectMenuConfig, TicketCategory, TicketButton, TicketMessage, Ticket } from "../entities/ticket_system";
import { ChatHistoryEntry } from "../entities/chat_history";

// Load environment variables
const configManager = ConfigManager.getInstance();

export const AppDataSource = new DataSource({
    type: "postgres",
    url: configManager.getPostgresUri(),
    synchronize: true, // Set to false in production
    logging: configManager.isDebugMode(),
    entities: [
        UserData, PremiumCoupon, BlockedUser, BlockReason,
        GuildConfig, TicketCategory, TicketButton, TicketMessage,
        Ticket, SelectMenuConfig, ChatHistoryEntry
    ],
    subscribers: [],
    migrations: [],
});

export const initializeDatabase = async (client: discord.Client): Promise<DataSource> => {
    try {
        const dataSource = await AppDataSource.initialize();
        return dataSource;
    } catch (error) {
        client.logger.error(`[DATABASE] Error initializing PostgreSQL: ${error}`);
        throw error;
    }
};

const event: BotEvent = {
    name: discord.Events.ClientReady,
    once: true,
    execute: async (client: discord.Client): Promise<void> => {
        try {
            const dataSource = await initializeDatabase(client);

            // Add dataSource to client for global access
            (client as any).dataSource = dataSource;

            client.logger.success(`[DATABASE] Connected to PostgreSQL database.`);
        } catch (error) {
            client.logger.error(`[DATABASE] Failed to connect to PostgreSQL: ${error}`);
            process.exit(1);
        }
    }
};

export default event;