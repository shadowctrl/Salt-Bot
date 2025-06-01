import discord from "discord.js";

import CommandLogger from "../core/command/logger";

import { ILogger } from "./logger";
import { IConfig } from "./config";
import { SlashCommand, Command } from "./events";

export * from "./db";
export * from "./ai";
export * from "./logger";
export * from "./ticket";
export * from "./events";
export * from "./config";


declare global {
    namespace NodeJS {
        interface ProcessEnv {
            DEBUG_MODE: boolean | string;
            TOKEN: string;
            POSTGRES_URI: string;
            FEEDBACK_WEBHOOK: string;
        }
    }
}

declare module "discord.js" {
    export interface Client {
        slashCommands: discord.Collection<string, SlashCommand>;
        commands: discord.Collection<string, Command>;
        cooldowns: discord.Collection<string, number>;
        logger: ILogger;
        cmdLogger: CommandLogger;
        config: IConfig;
    }
}