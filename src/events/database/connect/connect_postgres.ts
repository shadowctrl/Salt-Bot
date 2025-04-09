import discord from "discord.js";
import { DataSource } from "typeorm";
import { ConfigManager } from "../../../utils/config";
import { BlockedUser, BlockReason } from "../entities/blocked_users";
import { BotEvent } from "../../../types";

// Load environment variables
const configManager = ConfigManager.getInstance();

export const AppDataSource = new DataSource({
    type: "postgres",
    url: configManager.getPostgresUri(),
    synchronize: true, // Set to false in production
    logging: configManager.isDebugMode(),
    entities: [BlockedUser, BlockReason],
    subscribers: [],
    migrations: [],
});

export const initializeDatabase = async (): Promise<DataSource> => {
    try {
        const dataSource = await AppDataSource.initialize();
        return dataSource;
    } catch (error) {
        console.error("Error initializing database:", error);
        throw error;
    }
};

const event: BotEvent = {
    name: discord.Events.ClientReady,
    once: true,
    execute: async (client: discord.Client): Promise<void> => {
        try {
            const dataSource = await initializeDatabase();

            // Add dataSource to client for global access
            (client as any).dataSource = dataSource;

            client.logger.success(`[DATABASE] Connected to PostgreSQL database`);
        } catch (error) {
            client.logger.error(`[DATABASE] Failed to connect to PostgreSQL: ${error}`);
            process.exit(1);
        }
    }
};

export default event;