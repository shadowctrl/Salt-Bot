import discord from 'discord.js';

import { SlashCommand } from '../../../types';

import { infoTicket } from './info';
import { claimTicket } from './claim';
import { closeTicket } from './close';
import { deployTicket } from './deploy';
import { reopenTicket } from './reopen';
import { configTicket } from './config';
import { addUserToTicket } from './add';
import { transcriptTicket } from './transcript';
import { removeUserFromTicket } from './remove';
import { transferTicketOwner } from './transfer_owner';

const ticketCommand: SlashCommand = {
	cooldown: 5,
	owner: false,
	userPerms: [discord.PermissionFlagsBits.SendMessages],
	botPerms: [discord.PermissionFlagsBits.SendMessages, discord.PermissionFlagsBits.EmbedLinks],
	data: new discord.SlashCommandBuilder()
		.setName('ticket')
		.setDescription('Ticket system commands')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('close')
				.setDescription('Close the current ticket')
				.addStringOption((option) => option.setName('reason').setDescription('Reason for closing the ticket').setRequired(false))
		)
		.addSubcommand((subcommand) => subcommand.setName('reopen').setDescription('Reopen a closed ticket'))
		.addSubcommand((subcommand) =>
			subcommand
				.setName('deploy')
				.setDescription('Deploy ticket system panel')
				.addChannelOption((option) => option.setName('channel').setDescription('Channel to deploy the ticket panel in').addChannelTypes(discord.ChannelType.GuildText, discord.ChannelType.GuildAnnouncement).setRequired(true))
		)
		.addSubcommandGroup((group) =>
			group
				.setName('config')
				.setDescription('Configure ticket system settings')
				.addSubcommand((subcommand) =>
					subcommand
						.setName('button')
						.setDescription('Configure ticket button settings')
						.addStringOption((option) => option.setName('label').setDescription('Label for the ticket button').setRequired(false))
						.addStringOption((option) => option.setName('emoji').setDescription('Emoji for the ticket button').setRequired(false))
						.addStringOption((option) => option.setName('style').setDescription('Button style').setRequired(false).addChoices({ name: 'Primary (Blue)', value: 'PRIMARY' }, { name: 'Secondary (Grey)', value: 'SECONDARY' }, { name: 'Success (Green)', value: 'SUCCESS' }, { name: 'Danger (Red)', value: 'DANGER' }))
						.addStringOption((option) => option.setName('title').setDescription('Title for the ticket panel embed').setRequired(false))
						.addStringOption((option) => option.setName('description').setDescription('Description for the ticket panel embed').setRequired(false))
						.addStringOption((option) => option.setName('color').setDescription('Color for the ticket panel embed (hex code)').setRequired(false))
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('category')
						.setDescription('Configure ticket category settings')
						.addStringOption((option) => option.setName('action').setDescription('Action to perform').setRequired(true).addChoices({ name: 'Create', value: 'create' }, { name: 'Edit', value: 'edit' }, { name: 'Delete', value: 'delete' }, { name: 'List', value: 'list' }))
						.addStringOption((option) => option.setName('name').setDescription('Name for the ticket category').setRequired(false))
						.addStringOption((option) => option.setName('description').setDescription('Description for the ticket category').setRequired(false))
						.addStringOption((option) => option.setName('emoji').setDescription('Emoji for the ticket category').setRequired(false))
						.addRoleOption((option) => option.setName('support_role').setDescription('Support role for the ticket category').setRequired(false))
						.addChannelOption((option) => option.setName('parent_category').setDescription('Parent category for tickets').addChannelTypes(discord.ChannelType.GuildCategory).setRequired(false))
						.addStringOption((option) => option.setName('category_id').setDescription('ID of the category to edit/delete (required for edit/delete)').setRequired(false))
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('message')
						.setDescription('Configure ticket message settings')
						.addStringOption((option) => option.setName('category_id').setDescription('ID of the category to configure messages for').setRequired(true))
						.addStringOption((option) => option.setName('welcome_message').setDescription('Welcome message for new tickets').setRequired(false))
						.addStringOption((option) => option.setName('close_message').setDescription('Message shown when tickets are closed').setRequired(false))
						.addBooleanOption((option) => option.setName('include_support_team').setDescription('Whether to ping the support team when tickets are created').setRequired(false))
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('transcript')
						.setDescription('Configure ticket transcript settings')
						.addChannelOption((option) => option.setName('channel').setDescription('Channel to send ticket transcripts to').addChannelTypes(discord.ChannelType.GuildText).setRequired(false))
				)
		)
		.addSubcommand((subcommand) => subcommand.setName('info').setDescription('Get information about the current ticket'))
		.addSubcommand((subcommand) =>
			subcommand
				.setName('transcript')
				.setDescription('Generate a transcript of the current ticket')
				.addUserOption((option) => option.setName('user').setDescription('Send the transcript to this user (optional)').setRequired(false))
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('add')
				.setDescription('Add a user to the current ticket')
				.addUserOption((option) => option.setName('user').setDescription('The user to add to the ticket').setRequired(true))
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('remove')
				.setDescription('Remove a user from the current ticket')
				.addUserOption((option) => option.setName('user').setDescription('The user to remove from the ticket').setRequired(true))
		)
		.addSubcommand((subcommand) => subcommand.setName('claim').setDescription('Claim the current ticket as a support agent'))
		.addSubcommand((subcommand) =>
			subcommand
				.setName('transfer_owner')
				.setDescription('Transfer ownership of this ticket to another user')
				.addUserOption((option) => option.setName('user').setDescription('The user to transfer ticket ownership to').setRequired(true))
		),

	execute: async (interaction: discord.ChatInputCommandInteraction, client: discord.Client) => {
		try {
			if (!(client as any).dataSource) {
				await interaction.reply({
					embeds: [new discord.EmbedBuilder().setTitle('❌ Error').setDescription('Database connection is not available.').setColor('Red')],
					flags: discord.MessageFlags.Ephemeral,
				});
				return;
			}

			const subcommand = interaction.options.getSubcommand();
			const subcommandGroup = interaction.options.getSubcommandGroup();

			if (subcommandGroup === 'config') {
				await configTicket(interaction, client, subcommand);
			} else {
				switch (subcommand) {
					case 'close':
						await closeTicket(interaction, client);
						break;
					case 'reopen':
						await reopenTicket(interaction, client);
						break;
					case 'deploy':
						await deployTicket(interaction, client);
						break;
					case 'info':
						await infoTicket(interaction, client);
						break;
					case 'transcript':
						await transcriptTicket(interaction, client);
						break;
					case 'add':
						await addUserToTicket(interaction, client);
						break;
					case 'remove':
						await removeUserFromTicket(interaction, client);
						break;
					case 'claim':
						await claimTicket(interaction, client);
						break;
					case 'transfer_owner':
						await transferTicketOwner(interaction, client);
						break;
					default:
						await interaction.reply({
							embeds: [new discord.EmbedBuilder().setTitle('❌ Error').setDescription('Unknown subcommand.').setColor('Red')],
							flags: discord.MessageFlags.Ephemeral,
						});
				}
			}
		} catch (error) {
			client.logger.error(`[TICKET_CMD] Error in ticket command: ${error}`);

			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						embeds: [new discord.EmbedBuilder().setTitle('❌ Error').setDescription('An error occurred while processing your request.').setColor('Red')],
						flags: discord.MessageFlags.Ephemeral,
					});
				} else {
					await interaction.reply({
						embeds: [new discord.EmbedBuilder().setTitle('❌ Error').setDescription('An error occurred while processing your request.').setColor('Red')],
						flags: discord.MessageFlags.Ephemeral,
					});
				}
			} catch (replyError) {
				client.logger.error(`[TICKET_CMD] Failed to send error response: ${replyError}`);
			}
		}
	},
};

export default ticketCommand;
