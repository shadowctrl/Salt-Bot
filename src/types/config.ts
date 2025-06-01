import discord from 'discord.js';

import { BotPresence } from './events';


export interface IConfig {
    bot: {
        owners: Array<string>;
        support: {
            link: string;
        };
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
    };
    embed: {
        color: {
            default: discord.ColorResolvable | null;
            error: discord.ColorResolvable | null;
            success: discord.ColorResolvable | null;
            warning: discord.ColorResolvable | null;
        };
    };
    ai: {
        chatbot: {
            embedding: {
                model: string;
            };
        };
    };
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
        };
    };
};