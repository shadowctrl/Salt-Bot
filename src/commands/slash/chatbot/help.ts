import discord from 'discord.js';

import { EmbedTemplate } from '../../../core/embed/template';

export const handleHelp = async (interaction: discord.ChatInputCommandInteraction, client: discord.Client): Promise<void> => {
	try {
		const helpSection = interaction.options.getString('section') || 'overview';
		const embeds: discord.EmbedBuilder[] = [];
		switch (helpSection) {
			case 'overview':
				embeds.push(createOverviewEmbed(client));
				break;
			case 'setup':
				embeds.push(...createSetupEmbeds());
				break;
			case 'customization':
				embeds.push(...createCustomizationEmbeds());
				break;
			case 'rag':
				embeds.push(...createRagEmbeds());
				break;
			case 'troubleshooting':
				embeds.push(createTroubleshootingEmbed());
				break;
			case 'examples':
				embeds.push(...createExamplesEmbeds());
				break;
			default:
				embeds.push(createOverviewEmbed(client));
		}

		const embedsToSend = embeds.slice(0, 10);
		await interaction.editReply({ embeds: embedsToSend });
	} catch (error) {
		client.logger.error(`[CHATBOT_HELP] Error displaying help: ${error}`);
		await interaction.editReply({ embeds: [new EmbedTemplate(client).error('An error occurred while displaying help information.')] });
	}
};

const createOverviewEmbed = (client: discord.Client): discord.EmbedBuilder => {
	return new discord.EmbedBuilder()
		.setTitle('🤖 AI Chatbot System - Overview')
		.setDescription(
			`Welcome to the $ Bot AI Chatbot system! This powerful feature allows you to create intelligent AI assistants that can respond to users in your Discord channels.\n\n` +
				'**🌟 Key Features:**\n' +
				'• **Ready to Use** - No API keys or setup complexity required\n' +
				'• **Customizable Personality** - Define how your bot responds and behaves\n' +
				'• **Knowledge Integration** - Upload documents for context-aware responses (RAG)\n' +
				'• **Conversation Memory** - Maintains chat history for natural conversations\n' +
				'• **Easy Management** - Simple commands to configure and maintain\n\n' +
				'**📚 Help Sections:**\n' +
				'`/chatbot help section:setup` - Quick setup guide\n' +
				'`/chatbot help section:customization` - Customization options\n' +
				'`/chatbot help section:rag` - Knowledge base system guide\n' +
				'`/chatbot help section:examples` - Real-world setup examples\n' +
				'`/chatbot help section:troubleshooting` - Common issues and solutions'
		)
		.setColor('Blue')
		.setFooter({ text: 'Use the section parameter to view specific help topics' });
};

const createSetupEmbeds = (): discord.EmbedBuilder[] => {
	const setupEmbed1 = new discord.EmbedBuilder()
		.setTitle('🚀 Quick Setup Guide')
		.setDescription(
			'Setting up your AI chatbot is now incredibly simple! No API keys or technical configuration required.\n\n' +
				'**Step 1: Run the Setup Command**\n' +
				'Use `/chatbot setup` to create your AI assistant. The command will automatically handle all technical aspects.\n\n' +
				'**Step 2: Customize (Optional)**\n' +
				'You can customize your chatbot during setup or later:\n' +
				'• **Name** - Give your bot a unique name\n' +
				'• **Channel** - Choose where it operates (creates one if not specified)\n' +
				'• **Response Type** - Define personality and behavior\n\n' +
				'**Step 3: Start Chatting!**\n' +
				'Once set up, users can immediately start chatting with your AI assistant in the designated channel.'
		)
		.setColor('Green');

	const setupEmbed2 = new discord.EmbedBuilder()
		.setTitle('⚙️ Setup Command Usage')
		.setDescription(
			'**Basic Setup (Minimal):**\n' +
				'```\n/chatbot setup\n```\n' +
				'Creates a chatbot with default settings in a new channel.\n\n' +
				'**Custom Setup:**\n' +
				'```\n/chatbot setup\n' +
				'  name: SupportBot\n' +
				'  channel: #ai-support\n' +
				'  response_type: Professional customer service representative\n```\n\n' +
				'**What Happens During Setup:**\n' +
				'• Creates or configures the specified channel\n' +
				'• Sets up proper bot permissions\n' +
				'• Applies a 5-second rate limit for quality conversations\n' +
				'• Tests the AI connection to ensure everything works\n' +
				'• Sends a welcome message to the channel'
		)
		.setColor('Green');
	return [setupEmbed1, setupEmbed2];
};

const createCustomizationEmbeds = (): discord.EmbedBuilder[] => {
	const customizationEmbed1 = new discord.EmbedBuilder()
		.setTitle('🎨 Customization Options')
		.setDescription(
			"Personalize your chatbot to match your server's needs and personality.\n\n" +
				'**🏷️ Chatbot Name**\n' +
				"Choose a name that reflects your bot's purpose:\n" +
				'• `SupportBot` - For customer support\n' +
				'• `GameGuide` - For gaming assistance\n' +
				'• `StudyBuddy` - For educational help\n' +
				'• `CreativeAI` - For creative projects\n\n' +
				'**🎭 Response Type (Personality)**\n' +
				'Define how your bot should respond and behave:\n' +
				'• Professional and formal\n' +
				'• Friendly and casual\n' +
				'• Technical expert with detailed explanations\n' +
				'• Creative and imaginative\n' +
				'• Patient teacher who explains step by step'
		)
		.setColor('Purple');

	const customizationEmbed2 = new discord.EmbedBuilder()
		.setTitle('⚡ Managing Your Chatbot')
		.setDescription(
			'**View Current Settings:**\n' +
				'```\n/chatbot settings\n```\n' +
				'Shows all current configuration details.\n\n' +
				'**Update Settings:**\n' +
				'```\n/chatbot settings\n' +
				'  name: NewBotName\n' +
				'  response_type: Updated personality description\n' +
				'  enabled: true/false\n```\n\n' +
				'**Other Management Commands:**\n' +
				'• `/chatbot info` - View detailed bot information\n' +
				'• `/chatbot delete` - Remove the chatbot completely\n' +
				'• `/chatbot clear_history` - Clear conversation history'
		)
		.setColor('Purple');
	return [customizationEmbed1, customizationEmbed2];
};

const createRagEmbeds = (): discord.EmbedBuilder[] => {
	const ragEmbed1 = new discord.EmbedBuilder()
		.setTitle('📚 Knowledge Base System (RAG)')
		.setDescription(
			'Enhance your chatbot with custom knowledge by uploading documents. The bot will use this information to provide more accurate and relevant responses.\n\n' +
				'**🔍 How It Works:**\n' +
				'• Upload text or markdown files containing information\n' +
				'• The system processes and indexes the content\n' +
				'• Your chatbot can reference this knowledge in conversations\n' +
				'• Perfect for FAQs, documentation, policies, and guides\n\n' +
				'**📄 Supported File Types:**\n' +
				'• `.txt` - Plain text files\n' +
				'• `.md` - Markdown files\n' +
				'• Maximum file size: 10MB\n' +
				'• UTF-8 encoding recommended'
		)
		.setColor('Orange');

	const ragEmbed2 = new discord.EmbedBuilder()
		.setTitle('🔧 RAG Management Commands')
		.setDescription(
			'**Upload Knowledge:**\n' + '```\n/chatbot upload_rag\n' + '  file: [attach your file]\n' + '  description: Server rules and guidelines\n```\n\n' + '**Delete Knowledge:**\n' + '```\n/chatbot delete_rag\n```\n' + 'Removes all uploaded knowledge data.\n\n' + '**💡 Best Practices:**\n' + '• Use clear, well-structured documents\n' + '• Include relevant keywords and topics\n' + '• Keep information up to date\n' + '• Test the bot after uploading to ensure it understands the content'
		)
		.setColor('Orange');
	return [ragEmbed1, ragEmbed2];
};

const createExamplesEmbeds = (): discord.EmbedBuilder[] => {
	const examplesEmbed1 = new discord.EmbedBuilder()
		.setTitle('💼 Real-World Setup Examples')
		.setDescription(
			'**🎮 Gaming Server Assistant**\n' +
				'```\n/chatbot setup\n' +
				'  name: GameGuide\n' +
				'  channel: #game-help\n' +
				'  response_type: Friendly gaming expert who helps with strategies, tips, and game mechanics. Always enthusiastic about gaming and provides helpful advice.```\n\n' +
				'**💼 Business Support Bot**\n' +
				'```\n/chatbot setup\n' +
				'  name: SupportBot\n' +
				'  channel: #customer-support\n' +
				'  response_type: Professional customer service representative with expertise in our products and services. Always polite, helpful, and solution-oriented.```'
		)
		.setColor('Yellow');

	const examplesEmbed2 = new discord.EmbedBuilder()
		.setTitle('💡 More Setup Examples')
		.setDescription(
			'**🎓 Educational Tutor**\n' +
				'```\n/chatbot setup\n' +
				'  name: TutorBot\n' +
				'  channel: #study-help\n' +
				'  response_type: Patient and encouraging teacher who explains concepts clearly with examples and helps students learn step by step.```\n\n' +
				'**🤖 Technical Assistant**\n' +
				'```\n/chatbot setup\n' +
				'  name: TechExpert\n' +
				'  channel: #tech-support\n' +
				'  response_type: Knowledgeable programmer and system administrator who provides accurate technical solutions and code examples.```\n\n' +
				'**🎨 Creative Helper**\n' +
				'```\n/chatbot setup\n' +
				'  name: CreativeAI\n' +
				'  response_type: Imaginative and inspiring creative assistant who helps with writing, art ideas, and brainstorming sessions.```'
		)
		.setColor('Yellow');
	return [examplesEmbed1, examplesEmbed2];
};

const createTroubleshootingEmbed = (): discord.EmbedBuilder => {
	return new discord.EmbedBuilder()
		.setTitle('🛠️ Troubleshooting Guide')
		.setDescription(
			'**❌ Common Issues & Solutions:**\n\n' +
				'**"Bot not responding"**\n' +
				'• Check if the bot has permission to send messages in the channel\n' +
				'• Verify the chatbot is enabled: `/chatbot info`\n' +
				'• Try `/chatbot settings enabled:true` to re-enable\n\n' +
				'**"Setup failed"**\n' +
				'• Ensure you have Administrator permissions\n' +
				'• Check if the bot has necessary permissions in the server\n' +
				'• Try creating the channel manually first, then running setup\n\n' +
				'**"Chatbot giving unexpected responses"**\n' +
				'• Update the response type with `/chatbot settings`\n' +
				'• Clear conversation history with `/chatbot clear_history`\n' +
				'• Check if uploaded RAG knowledge conflicts with expectations\n\n' +
				'**"RAG knowledge not working"**\n' +
				'• Ensure your document uploaded successfully\n' +
				'• Try asking questions that directly relate to your content\n' +
				'• Check file format is .txt or .md and under 10MB\n\n' +
				'**🆘 Still Need Help?**\n' +
				'Contact your server administrators for assistance.'
		)
		.setColor('Red');
};
