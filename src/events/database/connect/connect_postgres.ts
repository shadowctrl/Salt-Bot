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
    synchronize: false, // Set to false in production
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
        client.logger.success('[DATABASE] Connected to PostgreSQL database');

        const vectorSupported = await initializeVectorExtension(dataSource);

        if (vectorSupported) {
            (dataSource.driver as any).supportedDataTypes.push('vector');
            (dataSource.driver as any).withLengthColumnTypes.push('vector');
            client.logger.info('[DATABASE] Vector data type support enabled in TypeORM');
        } else {
            client.logger.warn('[DATABASE] Vector data type support disabled - using fallback text search');
        }

        try {
            await dataSource.synchronize();
            client.logger.info('[DATABASE] Database schema synchronized');
        } catch (syncError) {
            client.logger.error(`[DATABASE] Schema synchronization failed: ${syncError}`);
            throw syncError;
        }

        if (vectorSupported) {
            try {
                const ragRepo = new RagRepository(dataSource);
                await ragRepo.initializeVectorColumns();
                client.logger.info('[DATABASE] RAG vector columns initialized');
            } catch (ragError) {
                client.logger.warn(`[DATABASE] Could not initialize RAG vector columns: ${ragError}`);
                client.logger.info('[DATABASE] RAG will use fallback text search');
            }
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