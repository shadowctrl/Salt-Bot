import discord from "discord.js";
import { LLM } from "../../utils/ai";
import { SlashCommand } from "../../types";
import { EmbedTemplate } from "../../utils/embed_template";
import { ChatbotConfig } from "../../events/database/entities/chatbot_config";
import { ChatbotConfigRepository } from "../../events/database/repo/chatbot_config";

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

const handleSetup = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    chatbotRepo: ChatbotConfigRepository
): Promise<void> => {
    try {
        const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
        if (existingConfig) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).warning("A chatbot is already set up for this server.")
                        .setDescription(`The chatbot is currently configured for <#${existingConfig.channelId}>. Use \`/chatbot settings\` to update the configuration or \`/chatbot delete\` to remove it first.`)
                ]
            });
            return;
        }

        let channel = interaction.options.getChannel("channel") as discord.TextChannel | null;
        const apiKey = interaction.options.getString("api_key", true);
        const modelName = interaction.options.getString("model_name", true);
        const baseUrl = interaction.options.getString("base_url") || "https://api.openai.com/v1";
        const name = interaction.options.getString("name") || "AI Assistant";
        const responseType = interaction.options.getString("response_type") || "Friendly and helpful";

        try {
            const llm = new LLM(apiKey, baseUrl);
            await llm.invoke(
                [{ role: "user", content: "Say 'API connection successful'" }],
                modelName,
                { max_tokens: 50 }
            );
        } catch (error) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Failed to connect to the API.")
                        .setDescription(`Error: ${error instanceof Error ? error.message : String(error)}`)
                ]
            });
            return;
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
                        {
                            id: interaction.guild!.roles.everyone,
                            allow: [discord.PermissionFlagsBits.ViewChannel, discord.PermissionFlagsBits.SendMessages]
                        },
                        {
                            id: client.user!.id,
                            allow: [
                                discord.PermissionFlagsBits.ViewChannel,
                                discord.PermissionFlagsBits.SendMessages,
                                discord.PermissionFlagsBits.EmbedLinks,
                                discord.PermissionFlagsBits.ReadMessageHistory
                            ]
                        }
                    ]
                });
                createdNewChannel = true;
            } catch (error) {
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).error("Failed to create chatbot channel.")
                            .setDescription(`Error: ${error instanceof Error ? error.message : String(error)}`)
                    ]
                });
                return;
            }
        }

        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Invalid channel type. Please select a valid text channel.")]
            });
            return;
        }

        const botMember = await interaction.guild!.members.fetchMe();
        const botPermissions = channel.permissionsFor(botMember!);

        if (!botPermissions?.has([
            discord.PermissionFlagsBits.SendMessages,
            discord.PermissionFlagsBits.EmbedLinks,
            discord.PermissionFlagsBits.ReadMessageHistory
        ])) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("I don't have the required permissions in that channel.")
                        .setDescription("I need the following permissions in the chatbot channel:\n• Send Messages\n• Embed Links\n• Read Message History")
                ]
            });
            return;
        }

        try {
            await channel.setRateLimitPerUser(5, "Chatbot rate limit");
        } catch (error) {
            client.logger.warn(`[CHATBOT_SETUP] Could not set channel rate limit: ${error}`);
        }

        const config = await chatbotRepo.createConfig(
            interaction.guildId!,
            channel.id,
            apiKey,
            modelName,
            baseUrl,
            name,
            responseType
        );

        if (!config) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Failed to create chatbot configuration.")]
            });
            return;
        }

        try {
            await channel.send({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle(`${name} is now active!`)
                        .setDescription(`This channel has been configured as an AI chatbot channel. You can start chatting with ${name} right away!`)
                        .setColor("Blue")
                        .setFooter({ text: "AI chatbot powered by Salt Bot", iconURL: client.user?.displayAvatarURL() })
                        .setTimestamp()
                ]
            });
        } catch (error) {
            client.logger.warn(`[CHATBOT_SETUP] Could not send welcome message: ${error}`);
        }

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Chatbot set up successfully!")
                    .setDescription(`The chatbot has been ${createdNewChannel ? 'created' : 'configured'} in ${channel}. Users can now chat with the bot in that channel.`)
                    .addFields(
                        { name: "Name", value: name, inline: true },
                        { name: "Model", value: modelName, inline: true },
                        { name: "Cooldown", value: "5 seconds", inline: true },
                        { name: "API", value: baseUrl, inline: true }
                    )
            ]
        });

        return;
    } catch (error) {
        client.logger.error(`[CHATBOT_SETUP] Error setting up chatbot: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while setting up the chatbot.")]
        });
    }
};

const handleSettings = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    chatbotRepo: ChatbotConfigRepository
): Promise<void> => {
    try {
        const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
        if (!existingConfig) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("No chatbot is set up for this server.")
                        .setDescription("Use `/chatbot setup` to create a new chatbot configuration.")
                ]
            });
            return;
        }

        const apiKey = interaction.options.getString("api_key");
        const modelName = interaction.options.getString("model_name");
        const baseUrl = interaction.options.getString("base_url");
        const name = interaction.options.getString("name");
        const responseType = interaction.options.getString("response_type");

        if (!apiKey && !modelName && !baseUrl && !name && !responseType) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Chatbot Settings")
                        .setDescription(`Current settings for the chatbot in <#${existingConfig.channelId}>`)
                        .addFields(
                            { name: "Name", value: existingConfig.chatbotName, inline: true },
                            { name: "Model", value: existingConfig.modelName, inline: true },
                            { name: "Cooldown", value: `${existingConfig.cooldown} seconds`, inline: true },
                            { name: "API", value: existingConfig.baseUrl, inline: true },
                            { name: "API Key", value: "••••••••" + existingConfig.apiKey.slice(-4), inline: true },
                            { name: "Enabled", value: existingConfig.enabled ? "Yes" : "No", inline: true },
                            { name: "Response Type", value: existingConfig.responseType || "Default", inline: false }
                        )
                        .setColor("Blue")
                        .setFooter({ text: "Use this command with options to update settings" })
                ]
            });
            return;
        }

        const updates: Partial<ChatbotConfig> = {};
        if (apiKey) updates.apiKey = apiKey;
        if (modelName) updates.modelName = modelName;
        if (baseUrl) updates.baseUrl = baseUrl;
        if (name) updates.chatbotName = name;
        if (responseType !== null) updates.responseType = responseType || "";

        if (apiKey || modelName || baseUrl) {
            try {
                const llm = new LLM(
                    apiKey || existingConfig.apiKey,
                    baseUrl || existingConfig.baseUrl
                );
                await llm.invoke(
                    [{ role: "user", content: "Say 'API connection successful'" }],
                    modelName || existingConfig.modelName,
                    { max_tokens: 50 }
                );
            } catch (error) {
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).error("Failed to connect to the API with the new settings.")
                            .setDescription(`Error: ${error instanceof Error ? error.message : String(error)}`)
                    ]
                });
                return;
            }
        }

        const updatedConfig = await chatbotRepo.updateConfig(interaction.guildId!, updates);
        if (!updatedConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Failed to update chatbot settings.")]
            });
            return;
        }

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Chatbot settings updated successfully!")
                    .setDescription(`The chatbot settings have been updated for <#${updatedConfig.channelId}>.`)
                    .addFields(
                        { name: "Name", value: updatedConfig.chatbotName, inline: true },
                        { name: "Model", value: updatedConfig.modelName, inline: true },
                        { name: "Cooldown", value: `${updatedConfig.cooldown} seconds`, inline: true },
                        { name: "API", value: updatedConfig.baseUrl, inline: true }
                    )
            ]
        });
        return;
    } catch (error) {
        client.logger.error(`[CHATBOT_SETTINGS] Error updating chatbot settings: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while updating chatbot settings.")]
        });
    }
};

const handleDelete = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    chatbotRepo: ChatbotConfigRepository
): Promise<void> => {
    try {
        const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
        if (!existingConfig) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("No chatbot is set up for this server.")
                ]
            });
            return;
        }

        const confirmEmbed = new discord.EmbedBuilder()
            .setTitle("⚠️ Delete Chatbot")
            .setDescription(
                "Are you sure you want to delete the chatbot configuration?\n\n" +
                `This will remove the chatbot from <#${existingConfig.channelId}> and delete all related settings.\n\n` +
                "Type `confirm` to proceed or `cancel` to abort."
            )
            .setColor("Red");

        await interaction.editReply({ embeds: [confirmEmbed] });

        const channel = interaction.channel as discord.TextChannel;
        if (!channel) return;

        try {
            const collected = await channel.awaitMessages({
                filter: (m) => m.author.id === interaction.user.id,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            try {
                await collected.first()?.delete();
            } catch (err) {
                client.logger.debug(`[CHATBOT_DELETE] Could not delete message: ${err}`);
            }

            const response = collected.first()?.content.trim().toLowerCase();

            if (response === "confirm") {
                const deleted = await chatbotRepo.deleteConfig(interaction.guildId!);

                if (!deleted) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Failed to delete chatbot configuration.")]
                    });
                    return;
                }

                try {
                    const botChannel = await client.channels.fetch(existingConfig.channelId) as discord.TextChannel;
                    if (botChannel && botChannel.isTextBased()) {
                        await botChannel.send({
                            embeds: [
                                new discord.EmbedBuilder()
                                    .setTitle("Chatbot Deactivated")
                                    .setDescription("This channel is no longer configured as a chatbot channel.")
                                    .setColor("Red")
                                    .setTimestamp()
                            ]
                        });
                    }
                } catch (error) {
                    client.logger.warn(`[CHATBOT_DELETE] Could not send deactivation message: ${error}`);
                }

                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).success("Chatbot configuration deleted successfully!")
                            .setDescription("The chatbot has been deactivated and all settings have been removed.")
                    ]
                });
                return;
            } else {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).info("Deletion cancelled.")]
                });
                return;
            }
        } catch (error) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).info("Deletion timed out. Operation cancelled.")]
            });
            return;
        }
    } catch (error) {
        client.logger.error(`[CHATBOT_DELETE] Error deleting chatbot: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while deleting the chatbot.")]
        });
    }
};

const handleInfo = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    chatbotRepo: ChatbotConfigRepository
): Promise<void> => {
    try {
        const existingConfig = await chatbotRepo.getConfig(interaction.guildId!);
        if (!existingConfig) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("No chatbot is set up for this server.")
                        .setDescription("Use `/chatbot setup` to create a new chatbot configuration.")
                ]
            });
            return;
        }

        let channelInfo = "Unknown (channel may have been deleted)";
        try {
            const channel = await client.channels.fetch(existingConfig.channelId);
            if (channel) {
                channelInfo = `<#${channel.id}>`;
            }
        } catch (error) {
            client.logger.warn(`[CHATBOT_INFO] Could not fetch channel: ${error}`);
        }

        const createdAt = new Date(existingConfig.createdAt);
        const createdTimestamp = Math.floor(createdAt.getTime() / 1000);

        const infoEmbed = new discord.EmbedBuilder()
            .setTitle("Chatbot Information")
            .setDescription(`Information about the chatbot in ${channelInfo}`)
            .addFields(
                { name: "Name", value: existingConfig.chatbotName, inline: true },
                { name: "Model", value: existingConfig.modelName, inline: true },
                { name: "Enabled", value: existingConfig.enabled ? "Yes" : "No", inline: true },
                { name: "Cooldown", value: `${existingConfig.cooldown} seconds`, inline: true },
                { name: "API", value: existingConfig.baseUrl, inline: true },
                { name: "API Key", value: "••••••••" + existingConfig.apiKey.slice(-4), inline: true },
                { name: "Created", value: `<t:${createdTimestamp}:R>`, inline: true }
            )
            .setColor("Blue")
            .setTimestamp();

        if (existingConfig.responseType) {
            infoEmbed.addFields({
                name: "Response Type",
                value: existingConfig.responseType.length > 1024 ?
                    existingConfig.responseType.substring(0, 1021) + "..." :
                    existingConfig.responseType,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [infoEmbed] });
        return;
    } catch (error) {
        client.logger.error(`[CHATBOT_INFO] Error getting chatbot info: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while getting chatbot information.")]
        });
    }
};

export default chatbotCommand;