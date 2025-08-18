import discord from 'discord.js';

import { EmbedTemplate } from '../../../core/embed/template';
import { ChatbotConfig } from '../../../events/database/entities/chat_bot';
import { ChatbotConfigRepository } from '../../../events/database/repo/chat_bot';

export const handleSettings = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client, chatbotRepo: ChatbotConfigRepository): Promise<discord.Message<boolean> | void> => {
	try {
		const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
		if (!existingConfig) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('No chatbot is set up for this server.').setDescription('Use `/chatbot setup` to create a new chatbot configuration.')] });

		const name = interaction.options.getString('name');
		const responseType = interaction.options.getString('response_type');
		const enabled = interaction.options.getBoolean('enabled');

		if (!name && !responseType && enabled === null) {
			return await interaction.editReply({
				embeds: [
					new discord.EmbedBuilder()
						.setTitle('Chatbot Settings')
						.setDescription(`Current settings for the chatbot in <#${existingConfig.channelId}>`)
						.addFields(
							{ name: 'Name', value: existingConfig.chatbotName, inline: true },
							{ name: 'Model', value: existingConfig.modelName, inline: true },
							{ name: 'Cooldown', value: `${existingConfig.cooldown} seconds`, inline: true },
							{ name: 'Enabled', value: existingConfig.enabled ? 'Yes' : 'No', inline: true },
							{ name: 'API Provider', value: existingConfig.baseUrl.includes('openai') ? 'OpenAI' : existingConfig.baseUrl.includes('anthropic') ? 'Anthropic' : existingConfig.baseUrl.includes('groq') ? 'Groq' : 'Custom', inline: true },
							{ name: 'Response Type', value: existingConfig.responseType || 'Default', inline: false }
						)
						.setColor('Blue')
						.setFooter({ text: 'Use this command with options to update customizable settings' }),
				],
			});
		}

		const updates: Partial<ChatbotConfig> = {};
		if (name) updates.chatbotName = name;
		if (responseType !== null) updates.responseType = responseType || '';
		if (enabled !== null) updates.enabled = enabled;
		const updatedConfig = await chatbotRepo.updateConfig(interaction.guildId!, updates);
		if (!updatedConfig) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Failed to update chatbot settings.')] });

		const changedFields: string[] = [];
		if (name) changedFields.push(`**Name:** ${name}`);
		if (responseType !== null) changedFields.push(`**Response Type:** ${responseType || 'Default'}`);
		if (enabled !== null) changedFields.push(`**Status:** ${enabled ? 'Enabled' : 'Disabled'}`);

		return await interaction.editReply({
			embeds: [
				new EmbedTemplate(client)
					.success('Chatbot settings updated successfully!')
					.setDescription(`The following settings have been updated for <#${updatedConfig.channelId}>:\n\n${changedFields.join('\n')}`)
					.addFields({ name: 'Current Name', value: updatedConfig.chatbotName, inline: true }, { name: 'Current Status', value: updatedConfig.enabled ? 'Enabled' : 'Disabled', inline: true }, { name: 'Model', value: updatedConfig.modelName, inline: true })
					.setFooter({ text: 'API credentials are managed by the bot owner', iconURL: client.user?.displayAvatarURL() }),
			],
		});
	} catch (error) {
		client.logger.error(`[CHATBOT_SETTINGS] Error updating chatbot settings: ${error}`);
		await interaction.editReply({ embeds: [new EmbedTemplate(client).error('An error occurred while updating chatbot settings.')] });
	}
};
