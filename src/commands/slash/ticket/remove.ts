import discord from 'discord.js';

import { Ticket } from '../../../core/ticket';
import { EmbedTemplate } from '../../../core/embed/template';

export const removeUserFromTicket = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client): Promise<void> => {
	await interaction.deferReply();

	try {
		const ticketManager = new Ticket((client as any).dataSource, client);
		const userToRemove = interaction.options.getUser('user');

		if (!userToRemove) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error('Please specify a valid user to remove.')],
			});
			return;
		}

		const result = await ticketManager.removeUser(interaction.channelId, userToRemove.id, interaction.user.id);

		if (result.success) {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).success(result.message)],
			});
		} else {
			await interaction.editReply({
				embeds: [new EmbedTemplate(client).error(result.message)],
			});
		}
	} catch (error) {
		client.logger.error(`[TICKET_REMOVE] Error removing user from ticket: ${error}`);
		await interaction.editReply({
			embeds: [new EmbedTemplate(client).error('An error occurred while removing the user from the ticket.')],
		});
	}
};
