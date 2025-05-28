import discord from "discord.js";

import { LLM } from "../../../core/ai";
import { EmbedTemplate } from "../../../core/embed/template";
import { ChatbotConfig } from "../../../events/database/entities/chatbot_config";
import { ChatbotConfigRepository } from "../../../events/database/repo/chatbot_config";


export const handleSettings = async (
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