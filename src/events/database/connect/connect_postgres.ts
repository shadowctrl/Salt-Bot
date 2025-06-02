import discord from "discord.js";
import { DataSource } from "typeorm";

import { BotEvent } from "../../../types";
import { ConfigManager } from "../../../utils/config";

import * as entities from "../entities";
import { initializeDatabase, initializeEncryption } from "./initialize_db";


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

const event: BotEvent = {
    name: discord.Events.ClientReady,
    once: true,
    execute: async (client: discord.Client): Promise<void> => {
        try {
            const dataSource = await initializeDatabase(client);
            (client as any).dataSource = dataSource;
            client.logger.success(`[DATABASE] Connected to PostgreSQL database.`);

            await initializeEncryption(client);

        } catch (error) {
            client.logger.error(`[DATABASE] Failed to connect to PostgreSQL: ${error}`);
            process.exit(1);
        }
    }
};

export { AppDataSource };

export default event;