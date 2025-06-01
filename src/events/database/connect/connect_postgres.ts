import discord from "discord.js";
import { DataSource } from "typeorm";

import { BotEvent } from "../../../types";
import { RagRepository } from "../repo/chat_bot";
import { ConfigManager } from "../../../utils/config";

import { initializeVectorExtension } from "./initialize_extensions";
import * as entities from "../entities";

const configManager = ConfigManager.getInstance();

const AppDataSource = new DataSource({
    type: "postgres",
    url: configManager.getPostgresUri(),
    synchronize: true, // Set to false in production
    logging: configManager.isDebugMode(),
    entities: Object.values(entities),
    subscribers: [],
    migrations: [],
});

(AppDataSource.driver as any).supportedDataTypes.push('vector');
(AppDataSource.driver as any).withLengthColumnTypes.push('vector');

const initializeDatabase = async (client: discord.Client): Promise<DataSource> => {
    try {
        const dataSource = await AppDataSource.initialize();

        try {
            await initializeVectorExtension(dataSource);
        } catch (initError) {
            client.logger.error(`[DATABASE] Error initializing Vector Extension: ${initError}`);
            throw initError;
        }

        try {
            const ragRepo = new RagRepository(dataSource);
            await ragRepo.initializeVectorColumns();
        } catch (ragError) {
            client.logger.error(`[DATABASE] Could not initialize RAG vector columns: ${ragError}`);
        }

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
            (client as any).dataSource = dataSource;
            client.logger.success(`[DATABASE] Connected to PostgreSQL database.`);
        } catch (error) {
            client.logger.error(`[DATABASE] Failed to connect to PostgreSQL: ${error}`);
            process.exit(1);
        }
    }
};

export { AppDataSource, initializeDatabase };

export default event;