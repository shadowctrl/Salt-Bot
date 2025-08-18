import discord from 'discord.js';

import Logger from './utils/logger';
import { Command, SlashCommand } from './types';
import CommandLogger from './core/command/logger';
import { loadConfig } from './utils/config';

/**
 * Creates and configures the Discord client with all necessary properties
 * @returns Configured Discord client
 */
const createClient = (): discord.Client => {
	const client = new discord.Client({
		intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildWebhooks, discord.GatewayIntentBits.GuildMessages, discord.GatewayIntentBits.MessageContent],
	});

	client.logger = new Logger();
	client.cmdLogger = new CommandLogger();
	client.slashCommands = new discord.Collection<string, SlashCommand>();
	client.commands = new discord.Collection<string, Command>();
	client.cooldowns = new discord.Collection<string, number>();
	client.config = loadConfig(client);

	return client;
};

const client = createClient();

export default client;
