import discord from 'discord.js';

import { LLM } from '../../../core/ai';
import { EmbedTemplate } from '../../../core/embed/template';
import { createDynamicTicketTool } from '../../../core/ai/tools';
import { ChatbotConfigRepository } from '../../../events/database/repo/chat_bot';
import { ConfigManager } from '../../../utils/config';

export const handleSetup = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client, chatbotRepo: ChatbotConfigRepository): Promise<discord.Message<boolean> | void> => {
	try {
		const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
		if (existingConfig) return await interaction.editReply({ embeds: [new EmbedTemplate(client).warning('A chatbot is already set up for this server.').setDescription(`The chatbot is currently configured for <#${existingConfig.channelId}>. Use \`/chatbot settings\` to update the configuration or \`/chatbot delete\` to remove it first.`)] });

		const configManager = ConfigManager.getInstance();

		let channel = interaction.options.getChannel('channel') as discord.TextChannel | null;
		const name = interaction.options.getString('name') || 'AI Assistant';
		const responseType = interaction.options.getString('response_type') || 'Friendly and helpful assistant';
		const apiKey = configManager.getDefaultChatbotApiKey();
		const modelName = configManager.getDefaultChatbotModel();
		const baseUrl = configManager.getDefaultChatbotBaseUrl();

		const tools = createDynamicTicketTool([
			{ id: '1', name: 'Technical Support' },
			{ id: '2', name: 'Billing Issues' },
			{ id: '3', name: 'General Inquiry' },
		]);

		try {
			const llm = new LLM(apiKey, baseUrl);
			await llm.invoke([{ role: 'user', content: "Say 'API connection successful'" }], modelName, { max_tokens: 50, tools: tools, tool_choice: 'auto' });
		} catch (error) {
			client.logger.error(`[CHATBOT_SETUP] API connection failed with predefined credentials: ${error}`);
			return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Failed to connect to the chatbot API.').setDescription('The bot owner needs to check the API configuration. Please contact an administrator.')] });
		}

		let createdNewChannel = false;
		if (!channel) {
			const currentChannel = interaction.channel as discord.TextChannel;
			const categoryId = currentChannel.parentId;
			try {
				channel = await interaction.guild!.channels.create({
					name: `${name.toLowerCase().replace(/\s+/g, '-')}-chat`,
					type: discord.ChannelType.GuildText,
					parent: categoryId || undefined,
					permissionOverwrites: [
						{ id: interaction.guild!.roles.everyone, allow: [discord.PermissionFlagsBits.ViewChannel, discord.PermissionFlagsBits.SendMessages] },
						{ id: client.user!.id, allow: [discord.PermissionFlagsBits.ViewChannel, discord.PermissionFlagsBits.SendMessages, discord.PermissionFlagsBits.EmbedLinks, discord.PermissionFlagsBits.ReadMessageHistory] },
					],
				});
				createdNewChannel = true;
			} catch (error) {
				return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Failed to create chatbot channel.').setDescription(`Error: ${error instanceof Error ? error.message : String(error)}`)] });
			}
		}

		if (!channel || !channel.isTextBased() || channel.isDMBased()) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Invalid channel type. Please select a valid text channel.')] });

		const botMember = await interaction.guild!.members.fetchMe();
		const botPermissions = channel.permissionsFor(botMember!);

		if (!botPermissions?.has([discord.PermissionFlagsBits.SendMessages, discord.PermissionFlagsBits.EmbedLinks, discord.PermissionFlagsBits.ReadMessageHistory])) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error("I don't have the required permissions in that channel.").setDescription('I need the following permissions in the chatbot channel:\n• Send Messages\n• Embed Links\n• Read Message History')] });

		try {
			await channel.setRateLimitPerUser(5, 'Chatbot rate limit');
		} catch (error) {
			client.logger.warn(`[CHATBOT_SETUP] Could not set channel rate limit: ${error}`);
		}

		const config = await chatbotRepo.createConfig(interaction.guildId!, channel.id, apiKey, modelName, baseUrl, name, responseType);
		if (!config) return await interaction.editReply({ embeds: [new EmbedTemplate(client).error('Failed to create chatbot configuration.')] });

		try {
			await channel.send({
				embeds: [
					new discord.EmbedBuilder()
						.setTitle(`${name} is now active!`)
						.setDescription(`This channel has been configured as an AI chatbot channel. You can start chatting with ${name} right away!`)
						.setColor('Blue')
						.setFooter({ text: `AI chatbot powered by ${client.user?.username} Bot`, iconURL: client.user?.displayAvatarURL() })
						.setTimestamp(),
				],
			});
		} catch (error) {
			client.logger.warn(`[CHATBOT_SETUP] Could not send welcome message: ${error}`);
		}

		return await interaction.editReply({
			embeds: [
				new EmbedTemplate(client)
					.success('Chatbot set up successfully!')
					.setDescription(`The chatbot has been ${createdNewChannel ? 'created' : 'configured'} in ${channel}. Users can now chat with the bot in that channel.\n\nUse \`/chatbot settings\` to update the name or personality, or \`/chatbot delete\` to remove it.`)
					.addFields({ name: 'Name', value: name, inline: true }, { name: 'Model', value: modelName, inline: true }, { name: 'Cooldown', value: '5 seconds', inline: true }, { name: 'Response Type', value: responseType, inline: false })
					.setFooter({ text: 'Use `/chatbot help` for more information!', iconURL: client.user?.displayAvatarURL() }),
			],
		});
	} catch (error) {
		client.logger.error(`[CHATBOT_SETUP] Error setting up chatbot: ${error}`);
		await interaction.editReply({ embeds: [new EmbedTemplate(client).error('An error occurred while setting up the chatbot.')] });
	}
};
