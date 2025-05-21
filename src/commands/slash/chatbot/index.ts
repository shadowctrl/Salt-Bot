import discord from "discord.js";
import { SlashCommand } from "../../../types";
import { EmbedTemplate } from "../../../utils/embed_template";
import { ChatbotConfigRepository } from "../../../events/database/repo/chatbot_config";

import { handleSetup } from "./setup";
import { handleSettings } from "./settings";
import { handleDelete } from "./delete";
import { handleInfo } from "./info";

const chatbotCommand: SlashCommand = {
    cooldown: 10,
    owner: false,
    userPerms: [discord.PermissionFlagsBits.Administrator],
    botPerms: [
        discord.PermissionFlagsBits.SendMessages,
        discord.PermissionFlagsBits.EmbedLinks
    ],
    data: new discord.SlashCommandBuilder()
        .setName("chatbot")
        .setDescription("Manage the AI chatbot for your server")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up a chatbot in a channel")
                .addStringOption(option =>
                    option.setName("api_key")
                        .setDescription("The API key for the chatbot service (OpenAI, Groq, etc.)")
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName("model_name")
                        .setDescription("The model name for the chatbot (e.g., gpt-4o-mini, compound-beta, claude-3.5-sonnet)")
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("The channel to use for the chatbot")
                        .addChannelTypes(discord.ChannelType.GuildText)
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("base_url")
                        .setDescription("The base URL for the chatbot API (default: OpenAI)")
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("name")
                        .setDescription("The name for the chatbot")
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("response_type")
                        .setDescription("How the chatbot should respond (instruction prompt)")
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("settings")
                .setDescription("Update chatbot settings")
                .addStringOption(option =>
                    option.setName("api_key")
                        .setDescription("The API key for the chatbot service")
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("model_name")
                        .setDescription("The model name for the chatbot")
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("base_url")
                        .setDescription("The base URL for the chatbot API")
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("name")
                        .setDescription("The name for the chatbot")
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName("response_type")
                        .setDescription("How the chatbot should respond (instruction prompt)")
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Delete the chatbot configuration for this server")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("info")
                .setDescription("Get information about the chatbot configuration")
        ),

    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });

        try {
            if (!(client as any).dataSource) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Database connection is not available.")]
                });
            }

            const chatbotRepo = new ChatbotConfigRepository((client as any).dataSource);
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case "setup":
                    await handleSetup(interaction, client, chatbotRepo);
                    break;
                case "settings":
                    await handleSettings(interaction, client, chatbotRepo);
                    break;
                case "delete":
                    await handleDelete(interaction, client, chatbotRepo);
                    break;
                case "info":
                    await handleInfo(interaction, client, chatbotRepo);
                    break;
                default:
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Unknown subcommand.")]
                    });
            }
        } catch (error) {
            client.logger.error(`[CHATBOT_CMD] Error in chatbot command: ${error}`);
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")]
            });
        }
    }
};

export default chatbotCommand;