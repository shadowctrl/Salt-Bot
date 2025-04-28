import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

export const deployTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Check if user has proper permissions
        if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You need Administrator permission to deploy the ticket panel.")]
            });
            return;
        }

        // Get the specified channel
        const targetChannel = interaction.options.getChannel("channel") as discord.TextChannel;
        if (!targetChannel || !(targetChannel instanceof discord.TextChannel)) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Please specify a valid text channel.")]
            });
            return;
        }

        // Check if bot has permissions to send messages in the target channel
        const botMember = await interaction.guild?.members.fetchMe();
        const botPermissions = targetChannel.permissionsFor(botMember!);

        if (!botPermissions?.has([
            discord.PermissionFlagsBits.SendMessages,
            discord.PermissionFlagsBits.EmbedLinks,
            discord.PermissionFlagsBits.ViewChannel
        ])) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("I don't have permissions to send messages in that channel.")
                        .setDescription("Please make sure I have the following permissions in the target channel:\n• View Channel\n• Send Messages\n• Embed Links")
                ]
            });
            return;
        }

        // Get ticket repository
        const ticketRepo = new TicketRepository((client as any).dataSource);

        // Get guild config
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

        // Check if ticket system is enabled
        if (!guildConfig.isEnabled) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("Ticket system is currently disabled.")
                        .setDescription("Please enable the ticket system before deploying the panel.")
                ]
            });
            return;
        }

        // Get ticket button configuration
        const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);
        if (!buttonConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Ticket button configuration not found.")]
            });
            return;
        }

        // Create the embed
        const ticketEmbed = new discord.EmbedBuilder()
            .setTitle(buttonConfig.embedTitle || "Need Help?")
            .setDescription(buttonConfig.embedDescription || "Click the button below to create a ticket")
            .setColor((buttonConfig.embedColor || "#5865F2") as discord.ColorResolvable)
            .setFooter({ text: "Powered by Salt Bot", iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

        // Get categories
        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);
        if (categories.length > 0) {
            const enabledCategories = categories.filter(cat => cat.isEnabled);

            // Add category info to embed if there are categories
            if (enabledCategories.length > 0) {
                const categoryList = enabledCategories.map(cat =>
                    `${cat.emoji || "🎫"} **${cat.name}** - ${cat.description || "No description"}`
                ).join("\n");
            }
        }

        // Get button style
        let style = discord.ButtonStyle.Primary;
        switch (buttonConfig.style?.toUpperCase()) {
            case "SECONDARY":
                style = discord.ButtonStyle.Secondary;
                break;
            case "SUCCESS":
                style = discord.ButtonStyle.Success;
                break;
            case "DANGER":
                style = discord.ButtonStyle.Danger;
                break;
        }

        // Create the button row
        const buttonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonConfig.label || "Create Ticket")
                    .setEmoji(buttonConfig.emoji || "🎫")
                    .setStyle(style)
            );

        // Send the panel
        const panelMessage = await targetChannel.send({
            embeds: [ticketEmbed],
            components: [buttonRow]
        });

        // Update the message ID and channel ID in the database
        await ticketRepo.configureTicketButton(interaction.guildId!, {
            messageId: panelMessage.id,
            channelId: targetChannel.id
        });

        // Update select menu config if using categories
        if (categories.length > 1) {
            await ticketRepo.configureSelectMenu(interaction.guildId!, {
                messageId: panelMessage.id
            });
        }

        // Send confirmation message
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket panel deployed successfully!")
                    .setDescription(`The ticket panel has been deployed to ${targetChannel}.`)
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_DEPLOY] Error deploying ticket panel: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while deploying the ticket panel.")]
        });
    }
};