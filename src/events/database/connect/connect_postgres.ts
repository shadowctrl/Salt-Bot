import { Pool } from "pg";
import discord from "discord.js";
import { ConfigManager } from "../../../utils/config";
import { BotEvent } from "../../../types";

// Load environment variables
const configManager = ConfigManager.getInstance();

const event: BotEvent = {
    name: discord.Events.ClientReady,
    once: true,
    execute: (client: discord.Client): void => {
        const POSTGRES_URL = configManager.getPostgresUri();
        if (!POSTGRES_URL) {
            throw new Error("Postgres URL is not defined in the environment variables.");
        }
        const pool = new Pool({
            connectionString: POSTGRES_URL,
        });
        pool.connect()
    }
};

export default event;