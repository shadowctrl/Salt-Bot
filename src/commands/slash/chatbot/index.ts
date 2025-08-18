import discord from 'discord.js';

import { SlashCommand } from '../../../types';
import { EmbedTemplate } from '../../../core/embed/template';
import { RagRepository, ChatbotConfigRepository } from '../../../events/database/repo/chat_bot';

import { handleInfo } from './info';
import { handleHelp } from './help';
import { handleSetup } from './setup';
import { handleDelete } from './delete';
import { handleSettings } from './settings';
import { handleUploadRag } from './upload_rag';
import { handleDeleteRag } from './delete_rag';
import { handleClearHistory } from './clear_history';

const chatbotCommand: SlashCommand = {
	cooldown: 10,
	owner: false,
	userPerms: [discord.PermissionFlagsBits.Administrator],
	botPerms: [discord.PermissionFlagsBits.Administrator],
	data: new discord.SlashCommandBuilder()
		.setName('chatbot')
		.setDescription('Manage the AI chatbot for your server')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('help')
				.setDescription('Get comprehensive help and setup instructions for the chatbot')
				.addStringOption((option) => option.setName('section').setDescription('Specific help section to view').setRequired(false).addChoices({ name: 'Overview', value: 'overview' }, { name: 'Setup Guide', value: 'setup' }, { name: 'AI Providers', value: 'providers' }, { name: 'Parameters', value: 'parameters' }, { name: 'Knowledge System (RAG)', value: 'rag' }, { name: 'Examples', value: 'examples' }, { name: 'Troubleshooting', value: 'troubleshooting' }))
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('setup')
				.setDescription('Set up a chatbot in a channel')
				.addStringOption((option) => option.setName('api_key').setDescription('The API key for the chatbot service (OpenAI, Groq, etc.)').setRequired(true))
				.addStringOption((option) => option.setName('model_name').setDescription('The model name for the chatbot (e.g., gpt-4o-mini, compound-beta, claude-3.5-sonnet)').setRequired(true))
				.addChannelOption((option) => option.setName('channel').setDescription('The channel to use for the chatbot').addChannelTypes(discord.ChannelType.GuildText).setRequired(false))
				.addStringOption((option) => option.setName('base_url').setDescription('The base URL for the chatbot API (default: OpenAI)').setRequired(false))
				.addStringOption((option) => option.setName('name').setDescription('The name for the chatbot').setRequired(false))
				.addStringOption((option) => option.setName('response_type').setDescription('How the chatbot should respond (instruction prompt)').setRequired(false))
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('settings')
				.setDescription('Update chatbot settings')
				.addStringOption((option) => option.setName('api_key').setDescription('The API key for the chatbot service').setRequired(false))
				.addStringOption((option) => option.setName('model_name').setDescription('The model name for the chatbot').setRequired(false))
				.addStringOption((option) => option.setName('base_url').setDescription('The base URL for the chatbot API').setRequired(false))
				.addStringOption((option) => option.setName('name').setDescription('The name for the chatbot').setRequired(false))
				.addStringOption((option) => option.setName('response_type').setDescription('How the chatbot should respond (instruction prompt)').setRequired(false))
		)
		.addSubcommand((subcommand) => subcommand.setName('delete').setDescription('Delete the chatbot configuration for this server'))
		.addSubcommand((subcommand) => subcommand.setName('info').setDescription('Get information about the chatbot configuration'))
		.addSubcommand((subcommand) =>
			subcommand
				.setName('upload_rag')
				.setDescription('Upload knowledge data for the chatbot to use')
				.addAttachmentOption((option) => option.setName('file').setDescription('Text or Markdown file with knowledge data (.txt, .md)').setRequired(true))
				.addStringOption((option) => option.setName('description').setDescription('Optional description of the uploaded knowledge').setRequired(false))
		)
		.addSubcommand((subcommand) => subcommand.setName('delete_rag').setDescription('Delete existing RAG knowledge data'))
		.addSubcommand((subcommand) => subcommand.setName('clear_history').setDescription('Clear your conversation history with the chatbot')),

	execute: async (interaction: discord.ChatInputCommandInteraction, client: discord.Client) => {
		await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });

		try {
			if (!(client as any).dataSource) {
				return interaction.editReply({
					embeds: [new EmbedTemplate(client).error('Database connection is not available.')],
				});
			}

			const chatbotRepo = new ChatbotConfigRepository((client as any).dataSource);
			const subcommand = interaction.options.getSubcommand();

			switch (subcommand) {
				case 'help':
					await handleHelp(interaction, client, chatbotRepo);
					break;
				case 'setup':
					await handleSetup(interaction, client, chatbotRepo);
					break;
				case 'settings':
					await handleSettings(interaction, client, chatbotRepo);
					break;
				case 'delete':
					await handleDelete(interaction, client, chatbotRepo);
					break;
				case 'info':
					await handleInfo(interaction, client, chatbotRepo);
					break;
				case 'upload_rag':
					const ragRepo = new RagRepository((client as any).dataSource);
					await handleUploadRag(interaction, client, ragRepo);
					break;
				case 'delete_rag':
					const deleteRagRepo = new RagRepository((client as any).dataSource);
					await handleDeleteRag(interaction, client, deleteRagRepo);
					break;
				case 'clear_history':
					await handleClearHistory(interaction, client);
					break;
				default:
					await interaction.editReply({
						embeds: [new EmbedTemplate(client).error('Unknown subcommand.')],
					});
			}
		} catch (error) {
			client.logger.error(`[CHATBOT_CMD] Error in chatbot command: ${error}`);
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('An error occurred while processing your request.')],
			});
		}
	},
};

export default chatbotCommand;
