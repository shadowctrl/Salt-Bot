import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import Formatter from "../../../utils/format";
import { ChatbotConfigRepository } from "../../../events/database/repo/chatbot_config";

export const handleHelp = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    chatbotRepo: ChatbotConfigRepository
): Promise<void> => {
    try {
        const helpSection = interaction.options.getString("section") || "overview";

        const embeds: discord.EmbedBuilder[] = [];

        switch (helpSection) {
            case "overview":
                embeds.push(createOverviewEmbed());
                break;
            case "setup":
                embeds.push(...createSetupEmbeds());
                break;
            case "providers":
                embeds.push(...createProvidersEmbeds());
                break;
            case "parameters":
                embeds.push(...createParametersEmbeds());
                break;
            case "rag":
                embeds.push(...createRagEmbeds());
                break;
            case "troubleshooting":
                embeds.push(createTroubleshootingEmbed());
                break;
            case "examples":
                embeds.push(...createExamplesEmbeds());
                break;
            default:
                embeds.push(createOverviewEmbed());
        }

        // Discord allows max 10 embeds per message
        const embedsToSend = embeds.slice(0, 10);

        await interaction.editReply({ embeds: embedsToSend });
    } catch (error) {
        client.logger.error(`[CHATBOT_HELP] Error displaying help: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while displaying help information.")]
        });
    }
};

const createOverviewEmbed = (): discord.EmbedBuilder => {
    return new discord.EmbedBuilder()
        .setTitle("🤖 AI Chatbot System - Overview")
        .setDescription(
            "Welcome to the Salt Bot AI Chatbot system! This powerful feature allows you to create intelligent AI assistants that can respond to users in your Discord channels.\n\n" +
            "**🌟 Key Features:**\n" +
            "• **Multiple AI Providers** - Support for OpenAI, Groq, Anthropic, and more\n" +
            "• **Knowledge Integration** - Upload documents for context-aware responses (RAG)\n" +
            "• **Conversation Memory** - Maintains chat history for natural conversations\n" +
            "• **Customizable Personality** - Define how your bot responds and behaves\n" +
            "• **Easy Management** - Simple commands to configure and maintain\n\n" +
            "**📚 Help Sections:**\n" +
            "`/chatbot help section:setup` - Step-by-step setup guide\n" +
            "`/chatbot help section:providers` - Popular AI provider configurations\n" +
            "`/chatbot help section:parameters` - Detailed parameter explanations\n" +
            "`/chatbot help section:rag` - Knowledge base system guide\n" +
            "`/chatbot help section:examples` - Real-world setup examples\n" +
            "`/chatbot help section:troubleshooting` - Common issues and solutions"
        )
        .setColor("Blue")
        .setFooter({ text: "Use the section parameter to view specific help topics" });
};

const createSetupEmbeds = (): discord.EmbedBuilder[] => {
    const setupEmbed1 = new discord.EmbedBuilder()
        .setTitle("🚀 Step-by-Step Setup Guide")
        .setDescription(
            "Follow these steps to set up your AI chatbot:\n\n" +
            "**Step 1: Choose Your AI Provider**\n" +
            "Select an AI service provider (OpenAI, Groq, Anthropic, etc.) and obtain an API key.\n\n" +
            "**Step 2: Get Your API Credentials**\n" +
            "• Visit your provider's website\n" +
            "• Create an account and navigate to API settings\n" +
            "• Generate an API key\n" +
            "• Note the base URL (if different from OpenAI)\n\n" +
            "**Step 3: Choose a Model**\n" +
            "Select an appropriate model for your needs:\n" +
            "• `gpt-4o-mini` - Fast and cost-effective (OpenAI)\n" +
            "• `llama-3.3-70b-versatile` - High quality responses (Groq)\n" +
            "• `claude-3.5-sonnet` - Advanced reasoning (Anthropic)"
        )
        .setColor("Green");

    const setupEmbed2 = new discord.EmbedBuilder()
        .setTitle("⚙️ Setup Command Usage")
        .setDescription(
            "**Basic Setup Command:**\n" +
            "```\n/chatbot setup\n" +
            "  api_key: your-api-key-here\n" +
            "  model_name: gpt-4o-mini\n```\n\n" +
            "**Advanced Setup with Custom Settings:**\n" +
            "```\n/chatbot setup\n" +
            "  api_key: your-api-key-here\n" +
            "  model_name: llama-3.3-70b-versatile\n" +
            "  base_url: https://api.groq.com/openai/v1\n" +
            "  name: GroqBot\n" +
            "  channel: #ai-chat\n" +
            "  response_type: Helpful and friendly assistant```\n\n" +
            "**What Happens After Setup:**\n" +
            "• A dedicated channel is created (or configured)\n" +
            "• The bot will respond to all messages in that channel\n" +
            "• Users can start chatting immediately\n" +
            "• Conversation history is maintained automatically"
        )
        .setColor("Green");

    return [setupEmbed1, setupEmbed2];
};

const createProvidersEmbeds = (): discord.EmbedBuilder[] => {
    const providersEmbed1 = new discord.EmbedBuilder()
        .setTitle("🌐 Popular AI Providers")
        .setDescription(
            "**🔥 OpenAI (Most Popular)**\n" +
            "• **Base URL:** `https://api.openai.com/v1`\n" +
            "• **Popular Models:** `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4.1-nano`\n" +
            "• **Get API Key:** [platform.openai.com](https://platform.openai.com)\n" +
            "• **Pros:** High quality, reliable, good documentation\n" +
            "• **Cons:** Can be expensive for high usage\n\n" +
            "**⚡ Groq (Fast & Free Tier)**\n" +
            "• **Base URL:** `https://api.groq.com/openai/v1`\n" +
            "• **Popular Models:** `llama-3.3-70b-versatile`, `llama3-70b-8192`, `llama-3.1-8b-instant`\n" +
            "• **Get API Key:** [console.groq.com](https://console.groq.com)\n" +
            "• **Pros:** Very fast responses, generous free tier\n" +
            "• **Cons:** Lower availability during peak times"
        )
        .setColor("Purple");

    const providersEmbed2 = new discord.EmbedBuilder()
        .setTitle("🌐 More AI Providers")
        .setDescription(
            "**🧠 Anthropic (Claude)**\n" +
            "• **Base URL:** `https://api.anthropic.com/v1`\n" +
            "• **Popular Models:** `claude-3.5-sonnet`, `claude-3.7-sonnet`, `claude-3-haiku`\n" +
            "• **Get API Key:** [console.anthropic.com](https://console.anthropic.com)\n" +
            "• **Pros:** Excellent reasoning, safety-focused\n" +
            "• **Cons:** More expensive, complex setup\n\n" +
            "**🌟 Mistral AI**\n" +
            "• **Base URL:** `https://api.mistral.ai/v1`\n" +
            "• **Popular Models:** `mistral-large`, `mistral-medium`\n" +
            "• **Get API Key:** [console.mistral.ai](https://console.mistral.ai)\n" +
            "• **Pros:** European-based, competitive pricing\n" +
            "• **Cons:** Smaller model selection\n\n" +
            "**💡 Local/Custom Providers**\n" +
            "You can also use local AI models or custom OpenAI-compatible APIs by providing the appropriate base URL."
        )
        .setColor("Purple");

    return [providersEmbed1, providersEmbed2];
};

const createParametersEmbeds = (): discord.EmbedBuilder[] => {
    const parametersEmbed1 = new discord.EmbedBuilder()
        .setTitle("📋 Required Parameters")
        .setDescription(
            "**🔑 API Key** *(Required)*\n" +
            "Your authentication key from the AI provider.\n" +
            "• **Format:** Usually a long string starting with `sk-` or similar\n" +
            "• **Security:** Keep this secret! Don't share it publicly\n" +
            "• **Example:** `sk-1234567890abcdef...`\n\n" +
            "**🤖 Model Name** *(Required)*\n" +
            "The specific AI model to use for responses.\n" +
            "• **OpenAI:** `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`\n" +
            "• **Groq:** `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`\n" +
            "• **Anthropic:** `claude-3.5-sonnet`, `claude-3-haiku`\n" +
            "• **Tip:** Start with smaller/faster models for testing"
        )
        .setColor("Orange");

    const parametersEmbed2 = new discord.EmbedBuilder()
        .setTitle("📋 Optional Parameters")
        .setDescription(
            "**🌐 Base URL** *(Optional)*\n" +
            "The API endpoint URL. Defaults to OpenAI's API.\n" +
            "• **Default:** `https://api.openai.com/v1`\n" +
            "• **Groq:** `https://api.groq.com/openai/v1`\n" +
            "• **Custom:** Your own API endpoint\n\n" +
            "**📛 Name** *(Optional)*\n" +
            "What to call your chatbot. Default: `AI Assistant`\n" +
            "• **Examples:** `HelperBot`, `GameMaster`, `TechSupport`\n" +
            "• **Tip:** Choose something that fits your server's theme\n\n" +
            "**💬 Channel** *(Optional)*\n" +
            "Which channel to use. If not specified, a new one is created.\n" +
            "• **Recommendation:** Use a dedicated channel for the bot\n" +
            "• **Note:** The bot will respond to ALL messages in this channel"
        )
        .setColor("Orange");

    const parametersEmbed3 = new discord.EmbedBuilder()
        .setTitle("📋 Response Type Parameter")
        .setDescription(
            "**🎭 Response Type** *(Optional)*\n" +
            "Instructions that define your bot's personality and behavior.\n\n" +
            "**Examples:**\n" +
            "• `Helpful and friendly assistant`\n" +
            "• `Professional technical support agent`\n" +
            "• `Casual gaming buddy who loves memes`\n" +
            "• `Wise mentor who speaks in philosophical terms`\n" +
            "• `Enthusiastic teacher who explains things simply`\n\n" +
            "**Tips for Good Response Types:**\n" +
            "• Be specific about tone and style\n" +
            "• Include relevant expertise areas\n" +
            "• Mention any special behaviors\n" +
            "• Keep it concise but descriptive\n" +
            "• Test different styles to find what works best"
        )
        .setColor("Orange");

    return [parametersEmbed1, parametersEmbed2, parametersEmbed3];
};

const createRagEmbeds = (): discord.EmbedBuilder[] => {
    const ragEmbed1 = new discord.EmbedBuilder()
        .setTitle("📚 Knowledge Base System (RAG)")
        .setDescription(
            "**What is RAG?**\n" +
            "RAG (Retrieval-Augmented Generation) allows your chatbot to use specific knowledge from documents you upload. This makes responses more accurate and contextual.\n\n" +
            "**How It Works:**\n" +
            "1. You upload text or markdown files with information\n" +
            "2. The system breaks them into searchable chunks\n" +
            "3. When users ask questions, relevant chunks are found\n" +
            "4. The AI uses this context to provide better answers\n\n" +
            "**Perfect For:**\n" +
            "• Server rules and guidelines\n" +
            "• Game guides and wikis\n" +
            "• FAQ documents\n" +
            "• Product documentation\n" +
            "• Company policies\n" +
            "• Any text-based knowledge"
        )
        .setColor("#1ABC9C");

    const ragEmbed2 = new discord.EmbedBuilder()
        .setTitle("📚 Using the Knowledge System")
        .setDescription(
            "**📤 Upload Knowledge:**\n" +
            "```\n/chatbot upload_rag\n" +
            "  file: your-document.txt\n" +
            "  description: Server rules and guidelines```\n\n" +
            "**📋 File Requirements:**\n" +
            "• **Formats:** `.txt` or `.md` files only\n" +
            "• **Size Limit:** 1MB maximum\n" +
            "• **Content:** Plain text or Markdown formatted\n" +
            "• **Language:** English works best\n\n" +
            "**🗑️ Manage Knowledge:**\n" +
            "• `/chatbot delete_rag` - Remove all knowledge data\n" +
            "• Only one knowledge file per server (replace to update)\n\n" +
            "**💡 Tips:**\n" +
            "• Write clear, well-structured documents\n" +
            "• Use headings and sections for better organization\n" +
            "• Include common questions and answers\n" +
            "• Test the bot after uploading to verify it works"
        )
        .setColor("#1ABC9C");

    return [ragEmbed1, ragEmbed2];
};

const createExamplesEmbeds = (): discord.EmbedBuilder[] => {
    const examplesEmbed1 = new discord.EmbedBuilder()
        .setTitle("💡 Real-World Setup Examples")
        .setDescription(
            "**🎮 Gaming Server Assistant**\n" +
            "```\n/chatbot setup\n" +
            "  api_key: sk-your-openai-key\n" +
            "  model_name: gpt-4o-mini\n" +
            "  name: GameGuide\n" +
            "  channel: #game-help\n" +
            "  response_type: Friendly gaming expert who helps with strategies, tips, and game mechanics```\n\n" +
            "**💼 Business Support Bot**\n" +
            "```\n/chatbot setup\n" +
            "  api_key: your-groq-key\n" +
            "  model_name: llama-3.3-70b-versatile\n" +
            "  base_url: https://api.groq.com/openai/v1\n" +
            "  name: SupportBot\n" +
            "  response_type: Professional customer service representative with expertise in our products and services```"
        )
        .setColor("Yellow");

    const examplesEmbed2 = new discord.EmbedBuilder()
        .setTitle("💡 More Setup Examples")
        .setDescription(
            "**🎓 Educational Tutor**\n" +
            "```\n/chatbot setup\n" +
            "  api_key: sk-your-openai-key\n" +
            "  model_name: gpt-4o\n" +
            "  name: TutorBot\n" +
            "  response_type: Patient and encouraging teacher who explains concepts clearly with examples and helps students learn step by step```\n\n" +
            "**🤖 Technical Assistant**\n" +
            "```\n/chatbot setup\n" +
            "  api_key: your-api-key\n" +
            "  model_name: claude-3.5-sonnet\n" +
            "  base_url: https://api.anthropic.com/v1\n" +
            "  name: TechExpert\n" +
            "  response_type: Knowledgeable programmer and system administrator who provides accurate technical solutions and code examples```"
        )
        .setColor("Yellow");

    return [examplesEmbed1, examplesEmbed2];
};

const createTroubleshootingEmbed = (): discord.EmbedBuilder => {
    return new discord.EmbedBuilder()
        .setTitle("🛠️ Troubleshooting Guide")
        .setDescription(
            "**❌ Common Issues & Solutions:**\n\n" +
            "**\"Failed to connect to API\"**\n" +
            "• Double-check your API key is correct\n" +
            "• Verify the base URL matches your provider\n" +
            "• Ensure your account has credits/quota remaining\n\n" +
            "**\"Bot not responding\"**\n" +
            "• Check if the bot has permission to send messages\n" +
            "• Verify the chatbot is enabled: `/chatbot info`\n" +
            "• Try `/chatbot settings` to test configuration\n\n" +
            "**\"Model not found\"**\n" +
            "• Verify the model name is exactly correct\n" +
            "• Check your provider's available models\n" +
            "• Some models require special access/approval\n\n" +
            "**\"Rate limiting errors\"**\n" +
            "• Your API key may have hit usage limits\n" +
            "• Try a different model or wait a few minutes\n" +
            "• Consider upgrading your API plan\n\n" +
            "**\"RAG not working\"**\n" +
            "• Ensure your document uploaded successfully\n" +
            "• Try asking questions that directly relate to your content\n" +
            "• Check file format is .txt or .md\n\n" +
            "**🆘 Still Need Help?**\n" +
            `Join our ${Formatter.hyperlink("support server", "https://discord.gg/XzE9hSbsNb")} support server with specific error messages.`
        )
        .setColor("Red")
        .setFooter({ text: "Remember to never share your API keys in public channels!" });
};