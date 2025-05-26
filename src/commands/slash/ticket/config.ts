import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { Ticket } from "../../../utils/ticket";

export const configTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    subcommand: string
): Promise<void> => {
    await interaction.deferReply();

    try {
        if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You need Administrator permission to configure the ticket system.")]
            });
            return;
        }

        const ticketManager = new Ticket((client as any).dataSource, client);
        const ticketRepo = ticketManager.getRepository();

        const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);
        if (!guildConfig) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Ticket system is not set up for this server.")
                        .setDescription("Please use `/setup` to set up the ticket system first.")
                ]
            });
            return;
        }

        switch (subcommand) {
            case "button":
                await configTicketButton(interaction, client, ticketRepo);
                break;
            case "category":
                await configTicketCategory(interaction, client, ticketRepo);
                break;
            case "message":
                await configTicketMessage(interaction, client, ticketRepo);
                break;
            case "transcript":
                await configTicketTranscript(interaction, client, ticketRepo);
                break;
            default:
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Unknown configuration subcommand.")]
                });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error in ticket config: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring the ticket system.")]
        });
    }
};

const configTicketButton = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: any
): Promise<void> => {
    try {
        const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);
        if (!buttonConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Ticket button configuration not found.")]
            });
            return;
        }

        const label = interaction.options.getString("label");
        const emoji = interaction.options.getString("emoji");
        const style = interaction.options.getString("style");
        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");
        const color = interaction.options.getString("color");

        if (!label && !emoji && !style && !title && !description && !color) {
            const embed = new discord.EmbedBuilder()
                .setTitle("🔧 Ticket Button Configuration")
                .setDescription("Current ticket button settings:")
                .addFields(
                    { name: "Label", value: buttonConfig.label || "Create Ticket", inline: true },
                    { name: "Emoji", value: buttonConfig.emoji || "🎫", inline: true },
                    { name: "Style", value: buttonConfig.style || "PRIMARY", inline: true },
                    { name: "Embed Title", value: buttonConfig.embedTitle || "None set", inline: true },
                    { name: "Embed Color", value: buttonConfig.embedColor || "Default", inline: true }
                )
                .setColor("Blue")
                .setFooter({ text: "Use the options to update these settings" });

            if (buttonConfig.embedDescription) {
                embed.addFields({
                    name: "Embed Description",
                    value: buttonConfig.embedDescription.length > 1024 ?
                        buttonConfig.embedDescription.substring(0, 1021) + "..." :
                        buttonConfig.embedDescription
                });
            }

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const updateData: Record<string, any> = {};
        if (label) updateData.label = label;
        if (emoji) updateData.emoji = emoji;
        if (style) updateData.style = style;
        if (title) updateData.embedTitle = title;
        if (description) updateData.embedDescription = description;
        if (color) {
            const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            if (color.startsWith('#') && !colorRegex.test(color)) {
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).error("Invalid color format.")
                            .setDescription("Please provide a valid hex color code (e.g., #FF5733).")
                    ]
                });
                return;
            }
            updateData.embedColor = color.startsWith('#') ? color : `#${color}`;
        }

        await ticketRepo.configureTicketButton(interaction.guildId!, updateData);
        const updatedConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket button configuration updated successfully!")
                    .setDescription("The changes will apply to any new ticket panels you deploy.")
                    .addFields(
                        { name: "Label", value: updatedConfig?.label || "Create Ticket", inline: true },
                        { name: "Emoji", value: updatedConfig?.emoji || "🎫", inline: true },
                        { name: "Style", value: updatedConfig?.style || "PRIMARY", inline: true }
                    )
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket button: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring the ticket button.")]
        });
    }
};

const configTicketCategory = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: any
): Promise<void> => {
    try {
        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);
        if (!categories || categories.length === 0) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("No ticket categories found.")]
            });
            return;
        }

        const categoryList = (categories as TicketCategory[]).map((cat: TicketCategory) =>
            `${cat.emoji || "🎫"} **${cat.name}** - ${cat.description || "No description"}`
        ).join("\n");

        const embed = new discord.EmbedBuilder()
            .setTitle("🔧 Ticket Category Configuration")
            .setDescription("Current ticket categories:")
            .addFields({ name: "Categories", value: categoryList || "No categories configured." })
            .setColor("Blue")
            .setFooter({ text: "Use the options to update these settings" });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket categories: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring ticket categories.")]
        });
    }
};

const configTicketMessage = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: any
): Promise<void> => {
    try {
        const messageConfig = await ticketRepo.getTicketMessageConfig(interaction.guildId!);
        if (!messageConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Ticket message configuration not found.")]
            });
            return;
        }

        const content = interaction.options.getString("content");
        const embedTitle = interaction.options.getString("embed_title");
        const embedDescription = interaction.options.getString("embed_description");
        const embedColor = interaction.options.getString("embed_color");

        if (!content && !embedTitle && !embedDescription && !embedColor) {
            const embed = new discord.EmbedBuilder()
                .setTitle("🔧 Ticket Message Configuration")
                .setDescription("Current ticket message settings:")
                .addFields(
                    { name: "Content", value: messageConfig.content || "No content set", inline: true },
                    { name: "Embed Title", value: messageConfig.embedTitle || "None set", inline: true },
                    { name: "Embed Color", value: messageConfig.embedColor || "Default", inline: true }
                )
                .setColor("Blue")
                .setFooter({ text: "Use the options to update these settings" });

            if (messageConfig.embedDescription) {
                embed.addFields({
                    name: "Embed Description",
                    value: messageConfig.embedDescription.length > 1024 ?
                        messageConfig.embedDescription.substring(0, 1021) + "..." :
                        messageConfig.embedDescription
                });
            }

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const updateData: Record<string, any> = {};
        if (content) updateData.content = content;
        if (embedTitle) updateData.embedTitle = embedTitle;
        if (embedDescription) updateData.embedDescription = embedDescription;
        if (embedColor) {
            const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            if (embedColor.startsWith('#') && !colorRegex.test(embedColor)) {
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).error("Invalid color format.")
                            .setDescription("Please provide a valid hex color code (e.g., #FF5733).")
                    ]
                });
                return;
            }
            updateData.embedColor = embedColor.startsWith('#') ? embedColor : `#${embedColor}`;
        }
        await ticketRepo.configureTicketMessage(interaction.guildId!, updateData);
        const updatedConfig = await ticketRepo.getTicketMessageConfig(interaction.guildId!);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket message configuration updated successfully!")
                    .setDescription("The changes will apply to any new ticket messages.")
                    .addFields(
                        { name: "Content", value: updatedConfig?.content || "No content set", inline: true },
                        { name: "Embed Title", value: updatedConfig?.embedTitle || "None set", inline: true },
                        { name: "Embed Color", value: updatedConfig?.embedColor || "Default", inline: true }
                    )
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket message: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring the ticket message.")]
        });
    }
};

const configTicketTranscript = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: any
): Promise<void> => {
    try {
        const transcriptConfig = await ticketRepo.getTicketTranscriptConfig(interaction.guildId!);
        if (!transcriptConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Ticket transcript configuration not found.")]
            });
            return;
        }
        const enabled = interaction.options.getBoolean("enabled");
        if (enabled === null) {
            const embed = new discord.EmbedBuilder()
                .setTitle("🔧 Ticket Transcript Configuration")
                .setDescription("Current ticket transcript settings:")
                .addFields(
                    { name: "Enabled", value: transcriptConfig.enabled ? "Yes" : "No", inline: true },
                    { name: "Channel", value: transcriptConfig.channelId ? `<#${transcriptConfig.channelId}>` : "Not set", inline: true }
                )
                .setColor("Blue")
                .setFooter({ text: "Use the options to update these settings" });

            await interaction.editReply({ embeds: [embed] });
            return;
        }
        const updateData: Record<string, any> = { enabled: enabled };
        if (enabled) {
            const channel = interaction.options.getChannel("channel");
            if (!channel || channel.type !== discord.ChannelType.GuildText) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Please specify a valid text channel for transcripts.")]
                });
                return;
            }
            updateData.channelId = channel.id;
        }
        await ticketRepo.configureTicketTranscript(interaction.guildId!, updateData);
        const updatedConfig = await ticketRepo.getTicketTranscriptConfig(interaction.guildId!);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket transcript configuration updated successfully!")
                    .setDescription("The changes will apply to any new tickets.")
                    .addFields(
                        { name: "Enabled", value: updatedConfig?.enabled ? "Yes" : "No", inline: true },
                        { name: "Channel", value: updatedConfig?.channelId ? `<#${updatedConfig.channelId}>` : "Not set", inline: true }
                    )
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket transcript: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring the ticket transcript.")]
        });
    }
};

interface TicketCategory {
    id: string;
    name: string;
    emoji?: string;
    description?: string;
}