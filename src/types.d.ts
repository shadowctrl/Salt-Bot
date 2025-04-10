import discord from "discord.js";
import { CommandLogger } from "./utils/command_logger";

//-----------COMMANDS-----------//

export interface SlashCommand {
    data: typeof data;
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

//-----------CONFIG-----------//

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
}

//-----------GLOBAL-----------//

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
        cmdLogger: typeof CommandLogger;
        config: IConfig;
    }
}

//-----------LOGGER-----------//

export interface ILogger {
    success(message: string | Error): void;
    log(message: string | Error): void;
    error(message: string | Error): void;
    warn(message: string | Error): void;
    info(message: string | Error): void;
    debug(message: string | Error): void;
}

export interface ICommandLogger {
    client: discord.Client;
    commandName: string;
    guild: discord.Guild | null;
    user: discord.User | null;
    channel: discord.TextChannel | null;
}

//-----------EVENTS-----------//

export interface BotEvent {
    name: string;
    once?: boolean | false;
    execute: (...args) => void;
}

//-----------INTERFACE-----------//

export interface BotPresence {
    name: string;
    type: discord.ActivityType;
}

export interface IBlockUser {
    id?: string;
    userId: string;
    status: boolean;
    data: IBlockReason[];
}

export interface IBlockReason {
    id?: string;
    reason: string;
    timestamp: Date;
}