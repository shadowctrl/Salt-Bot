import discord from 'discord.js';

import { Ticket } from '../../../core/ticket';
import { EmbedTemplate } from '../../../core/embed/template';

export const transferTicketOwner = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client): Promise<discord.Message<boolean> | void> => {
	await interaction.deferReply();

	try {
		const ticketManager = new Ticket((client as any).dataSource, client);
		const newOwner = interaction.options.getUser('user');
		if (!newOwner) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Please specify a valid user to transfer ownership to.')] });
		const result = await ticketManager.transferOwnership(interaction.channelId, newOwner.id, interaction.user.id);
		if (result.success) {
			await interaction.editReply({ embeds: [new EmbedTemplate(client).success(result.message)] });
		} else {
			await interaction.editReply({ embeds: [new EmbedTemplate(client).error(result.message)] });
		}
	} catch (error) {
		client.logger.error(`[TICKET_TRANSFER] Error transferring ticket ownership: ${error}`);
		await interaction.editReply({ embeds: [new EmbedTemplate(client).error('An error occurred while transferring ticket ownership.')] });
	}
};
