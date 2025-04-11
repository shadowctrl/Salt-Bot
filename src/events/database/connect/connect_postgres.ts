import fs from "fs";
import path from "path";
import discord from "discord.js";
import { DataSource } from "typeorm";
import { ConfigManager } from "../../../utils/config";
import { BotEvent } from "../../../types";

// Load environment variables
const configManager = ConfigManager.getInstance();

// Dynamically load all entity classes from the entities directory
const loadEntities = (): any[] => {
    const entitiesPath = path.join(__dirname, '../entities');
    const entityFiles = fs.readdirSync(entitiesPath)
        .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

    const entities: any[] = [];
    entityFiles.forEach(file => {
        // Use require to dynamically import the file
        const entityModule = require(path.join(entitiesPath, file));
        Object.keys(entityModule).forEach(key => {
            if (typeof entityModule[key] === 'function') {
                entities.push(entityModule[key]);
            }
        });
    });

    return entities;
};

export const AppDataSource = new DataSource({
    type: "postgres",
    url: configManager.getPostgresUri(),
    synchronize: true, // Set to false in production
    logging: configManager.isDebugMode(),
    entities: loadEntities(),
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

            client.logger.success(`[DATABASE] Connected to PostgreSQL database with ${loadEntities().length} entities`);
        } catch (error) {
            client.logger.error(`[DATABASE] Failed to connect to PostgreSQL: ${error}`);
            process.exit(1);
        }
    }
};

export default event;