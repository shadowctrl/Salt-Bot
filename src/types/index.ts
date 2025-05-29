import discord from "discord.js";

import CommandLogger from "../core/command/logger";
import { ILogger } from "./logger";

export * from "./logger";
export * from "./ticket";
export * from "./db";
export * from "./ai";


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

export interface SlashCommand {
    data: discord.SlashCommandBuilder | discord.SlashCommandSubcommandsOnlyBuilder | discord.SlashCommandOptionsOnlyBuilder;
    modal?: (
        interaction: discord.ModalSubmitInteraction<discord.CacheType>
    ) => void;
    userPerms?: Array<discord.PermissionResolvable>;
    botPerms?: Array<discord.PermissionResolvable>;
    cooldown?: number;
    owner?: boolean;
    premium?: boolean;
    execute: (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => void;
    autocomplete?: (
        interaction: discord.AutocompleteInteraction,
        client: discord.Client
    ) => void;
}

export interface Command {
    name: string;
    description: string;
    userPerms?: Array<discord.PermissionResolvable>;
    botPerms?: Array<discord.PermissionResolvable>;
    cooldown?: number;
    owner?: boolean;
    premium?: boolean;
    execute: (
        client: discord.Client,
        message: discord.Message,
        args: Array<string>
    ) => void;
}

export interface BotPresence {
    name: string;
    type: discord.ActivityType;
}

export interface IConfig {
    bot: {
        owners: Array<string>;
        support: {
            link: string;
        }
        presence: {
            enabled: boolean;
            status: string;
            interval: number;
            activity: Array<BotPresence>;
        };
        command: {
            prefix: string;
            disable_message: boolean;
            cooldown_message: string;
            register_specific_commands: {
                enabled: boolean;
                commands: Array<string>;
            };
        };
        log: {
            command: string;
            server: string;
        };
    }
    embed: {
        color: {
            default: discord.ColorResolvable | null;
            error: discord.ColorResolvable | null;
            success: discord.ColorResolvable | null;
            warning: discord.ColorResolvable | null;
        }
    }
    ticket: {
        default: {
            button: {
                label: string;
                emoji: string;
                style: string;
                embed_title: string;
                embed_description: string;
            };
            category: {
                name: string;
                description: string;
                emoji: string;
            };
            message: {
                welcome_message: string;
                close_message: string;
            };
            select_menu: {
                placeholder: string;
                embed_title: string;
                embed_description: string;
            };
        }
    }
}

export interface BotEvent {
    name: string;
    once?: boolean | false;
    execute: (...args: any[]) => void | Promise<void>;
}