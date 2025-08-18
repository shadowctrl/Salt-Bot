import discord from 'discord.js';

import { Ticket } from '../../../core/ticket';
import { ColorValidator } from '../../../utils/extras';
import { EmbedTemplate } from '../../../core/embed/template';

export const deployTicket = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client): Promise<void> => {
	await interaction.deferReply();

	try {
		if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('You need Administrator permission to deploy the ticket panel.')],
			});
			return;
		}

		const targetChannel = interaction.options.getChannel('channel') as discord.TextChannel;
		if (!targetChannel || !(targetChannel instanceof discord.TextChannel)) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('Please specify a valid text channel.')],
			});
			return;
		}

		const botMember = await interaction.guild?.members.fetchMe();
		const botPermissions = targetChannel.permissionsFor(botMember!);

		if (!botPermissions?.has([discord.PermissionFlagsBits.SendMessages, discord.PermissionFlagsBits.EmbedLinks, discord.PermissionFlagsBits.ViewChannel])) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error("I don't have permissions to send messages in that channel.").setDescription('Please make sure I have the following permissions in the target channel:\n• View Channel\n• Send Messages\n• Embed Links')],
			});
			return;
		}

		const ticketManager = new Ticket((client as any).dataSource, client);
		const ticketRepo = ticketManager.getRepository();

		const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);
		if (!guildConfig) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('Ticket system is not set up for this server.').setDescription('Please use `/setup` to set up the ticket system first.')],
			});
			return;
		}

		if (!guildConfig.isEnabled) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('Ticket system is currently disabled.').setDescription('Please enable the ticket system before deploying the panel.')],
			});
			return;
		}

		const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);
		if (!buttonConfig) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('Ticket button configuration not found.')],
			});
			return;
		}

		const embedColor = ColorValidator.validateAndFormatColor(buttonConfig.embedColor || '#5865F2') || '#5865F2';
		const ticketEmbed = new discord.EmbedBuilder()
			.setTitle(buttonConfig.embedTitle || 'Need Help?')
			.setDescription(buttonConfig.embedDescription || 'Click the button below to create a ticket')
			.setColor(embedColor as discord.ColorResolvable)
			.setFooter({ text: 'Powered by Salt Bot', iconURL: client.user?.displayAvatarURL() })
			.setTimestamp();

		const categories = await ticketRepo.getTicketCategories(interaction.guildId!);
		if (categories.length > 0) {
			const enabledCategories = categories.filter((cat) => cat.isEnabled);
			if (enabledCategories.length > 0) {
				const categoryList = enabledCategories.map((cat) => `${cat.emoji || '🎫'} **${cat.name}** - ${cat.description || 'No description'}`).join('\n');
			}
		}

		let style = discord.ButtonStyle.Primary;
		switch (buttonConfig.style?.toUpperCase()) {
			case 'SECONDARY':
				style = discord.ButtonStyle.Secondary;
				break;
			case 'SUCCESS':
				style = discord.ButtonStyle.Success;
				break;
			case 'DANGER':
				style = discord.ButtonStyle.Danger;
				break;
		}

		const buttonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
			new discord.ButtonBuilder()
				.setCustomId('create_ticket')
				.setLabel(buttonConfig.label || 'Create Ticket')
				.setEmoji(buttonConfig.emoji || '🎫')
				.setStyle(style)
		);

		const panelMessage = await targetChannel.send({
			embeds: [ticketEmbed],
			components: [buttonRow],
		});

		await ticketRepo.configureTicketButton(interaction.guildId!, {
			messageId: panelMessage.id,
			channelId: targetChannel.id,
		});

		if (categories.length > 1) {
			await ticketRepo.configureSelectMenu(interaction.guildId!, {
				messageId: panelMessage.id,
			});
		}

		await interaction.editReply({
			embeds: [new EmbedTemplate(client).success('Ticket panel deployed successfully!').setDescription(`The ticket panel has been deployed to ${targetChannel}.`)],
		});
	} catch (error) {
		client.logger.error(`[TICKET_DEPLOY] Error deploying ticket panel: ${error}`);
		await interaction.editReply({
			embeds: [new EmbedTemplate(client).error('An error occurred while deploying the ticket panel.')],
		});
	}
};
