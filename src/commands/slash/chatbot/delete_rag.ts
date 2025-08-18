import discord from 'discord.js';

import { EmbedTemplate } from '../../../core/embed/template';
import { RagRepository } from '../../../events/database/repo/chat_bot';

export const handleDeleteRag = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client, ragRepo: RagRepository): Promise<discord.Message<boolean> | void> => {
	try {
		const documentInfo = await ragRepo.getRagDocumentInfo(interaction.guildId!);
		if (!documentInfo) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('No knowledge data found.').setDescription('There is no RAG data to delete for this server.')] });
		const confirmEmbed = new discord.EmbedBuilder()
			.setTitle('⚠️ Delete Knowledge Data')
			.setDescription('Are you sure you want to delete all knowledge data for the chatbot?\n\n' + `This will remove the file "${documentInfo.fileName}" with ${documentInfo.chunkCount} chunks.\n\n` + 'Type `confirm` to proceed or `cancel` to abort.')
			.setColor('Red');

		await interaction.editReply({ embeds: [confirmEmbed] });

		const channel = interaction.channel as discord.TextChannel;
		if (!channel) return;

		try {
			const collected = await channel.awaitMessages({ filter: (m) => m.author.id === interaction.user.id, max: 1, time: 30000, errors: ['time'] });
			try {
				await collected.first()?.delete();
			} catch (err) {
				client.logger.debug(`[CHATBOT_RAG] Could not delete message: ${err}`);
			}

			const response = collected.first()?.content.trim().toLowerCase();

			if (response === 'confirm') {
				const deleted = await ragRepo.deleteRagData(interaction.guildId!);
				if (!deleted) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Failed to delete knowledge data.')] });
				await interaction.editReply({ embeds: [new EmbedTemplate(client).success('Knowledge data deleted successfully!').setDescription('All RAG data has been removed from the chatbot.').addFields({ name: 'Deleted File', value: documentInfo.fileName, inline: true }, { name: 'Chunks Removed', value: documentInfo.chunkCount.toString(), inline: true })] });
				return client.logger.info(`[CHATBOT_RAG] Deleted RAG data for guild ${interaction.guildId}`);
			} else {
				return await interaction.editReply({ embeds: [new EmbedTemplate(client).info('Deletion cancelled.')] });
			}
		} catch (error) {
			return await interaction.editReply({ embeds: [new EmbedTemplate(client).info('Deletion timed out. Operation cancelled.')] });
		}
	} catch (error) {
		client.logger.error(`[CHATBOT_RAG] Error deleting RAG data: ${error}`);
		await interaction.editReply({ embeds: [new EmbedTemplate(client).error('An error occurred while deleting knowledge data.')] });
	}
};
