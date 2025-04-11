import discord from "discord.js";
import { EmbedTemplate } from "../../utils/embed_template";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { SlashCommand } from "../../types";

// Create a collector filter for messages
const messageFilter = (m: discord.Message) => m.author.id === m.interaction?.user.id;

const setupCommand: SlashCommand = {
    cooldown: 10,
    owner: false,
    userPerms: [discord.PermissionFlagsBits.Administrator],
    botPerms: [
        discord.PermissionFlagsBits.ManageChannels,
        discord.PermissionFlagsBits.SendMessages,
        discord.PermissionFlagsBits.ManageMessages,
        discord.PermissionFlagsBits.EmbedLinks,
        discord.PermissionFlagsBits.UseExternalEmojis
    ],
    data: new discord.SlashCommandBuilder()
        .setName("setup")
        .setDescription("Setup ticket system for your server")
        .addChannelOption(option =>
            option.setName("ticket_channel")
                .setDescription("Channel where users can create tickets")
                .addChannelTypes(
                    discord.ChannelType.GuildText,
                    discord.ChannelType.GuildAnnouncement
                )
                .setRequired(false))
        .addRoleOption(option =>
            option.setName("ticket_supporters")
                .setDescription("Role for ticket supporters")
                .setRequired(false)),

    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        try {
            // Initial reply to acknowledge the command
            await interaction.deferReply();

            // Check if database is connected
            if (!(client as any).dataSource) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Database connection is not available.")]
                });
            }

            // Get the ticket repository
            const ticketRepo = new TicketRepository((client as any).dataSource);

            // Create or get guild config
            const guildConfig = await ticketRepo.getOrCreateGuildConfig(interaction.guildId!);

            // Get specified channel or use current channel
            const ticketChannel = interaction.options.getChannel("ticket_channel") || interaction.channel;
            if (!ticketChannel || !(ticketChannel instanceof discord.TextChannel)) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Invalid ticket channel. Please specify a text channel.")]
                });
            }

            // Get specified supporter role or leave it null
            const supportersRole = interaction.options.getRole("ticket_supporters");

            // Setup initial configuration
            const setupEmbed = new discord.EmbedBuilder()
                .setTitle("🎫 Ticket System Setup")
                .setDescription(
                    "Let's set up your ticket system! I'll ask you a few questions. " +
                    "You can reply to each message with your response.\n\n" +
                    "To cancel setup at any time, type `cancel`."
                )
                .addFields(
                    { name: "Ticket Channel", value: `${ticketChannel}`, inline: true },
                    {
                        name: "Support Role",
                        value: supportersRole ? `${supportersRole}` : "Not specified",
                        inline: true
                    }
                )
                .setColor("Blue")
                .setFooter({ text: "Step 1/5: Ticket Button Configuration" });

            await interaction.editReply({ embeds: [setupEmbed] });

            // Create message collector
            const channel = interaction.channel as discord.TextChannel;
            if (!channel) return;

            // STEP 1: Configure ticket button
            const buttonConfigEmbed = new discord.EmbedBuilder()
                .setTitle("🔘 Ticket Button Configuration")
                .setDescription(
                    "Let's set up the ticket creation button.\n\n" +
                    "Please enter the following details in this format:\n" +
                    "`Button Label | Button Emoji | Button Style | Embed Title | Embed Description`\n\n" +
                    "Example:\n" +
                    "`Create Ticket | 🎫 | Primary | Need Help? | Click the button below to create a ticket!`\n\n" +
                    "Available button styles: Primary (blue), Secondary (grey), Success (green), Danger (red)\n\n" +
                    "You can press Enter after each line. Type `default` to use default values."
                )
                .setColor("Blue");

            const buttonMsg = await channel.send({ embeds: [buttonConfigEmbed] });

            try {
                const buttonCollected = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    max: 1,
                    time: 300000,
                    errors: ['time']
                });

                // Clean up user message
                try {
                    await buttonCollected.first()?.delete();
                } catch (err) {
                    client.logger.debug(`[SETUP] Could not delete message: ${err}`);
                }

                const buttonResponse = buttonCollected.first()?.content.trim();

                // Check for cancel
                if (buttonResponse?.toLowerCase() === "cancel") {
                    await buttonMsg.delete().catch(() => { });
                    return interaction.followUp({
                        embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                        ephemeral: true
                    });
                }

                // Parse button configuration
                let buttonLabel = "Create Ticket";
                let buttonEmoji = "🎫";
                let buttonStyle = "Primary";
                let embedTitle = "Need Help?";
                let embedDescription = "Click the button below to create a ticket!";

                if (buttonResponse && buttonResponse.toLowerCase() !== "default") {
                    const parts = buttonResponse.split("|").map(part => part.trim());
                    if (parts.length >= 1 && parts[0]) buttonLabel = parts[0];
                    if (parts.length >= 2 && parts[1]) buttonEmoji = parts[1];
                    if (parts.length >= 3 && parts[2]) {
                        const style = parts[2].toLowerCase();
                        if (["primary", "secondary", "success", "danger"].includes(style)) {
                            buttonStyle = style.charAt(0).toUpperCase() + style.slice(1);
                        }
                    }
                    if (parts.length >= 4 && parts[3]) embedTitle = parts[3];
                    if (parts.length >= 5 && parts[4]) embedDescription = parts[4];
                }

                // Configure button in database
                await ticketRepo.configureTicketButton(interaction.guildId!, {
                    label: buttonLabel,
                    emoji: buttonEmoji,
                    style: buttonStyle.toUpperCase(),
                    channelId: ticketChannel.id,
                    embedTitle: embedTitle,
                    embedDescription: embedDescription
                });

                await buttonMsg.edit({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("🔘 Ticket Button Configuration")
                            .setDescription("Button configuration saved successfully!")
                            .addFields(
                                { name: "Button Label", value: buttonLabel, inline: true },
                                { name: "Button Emoji", value: buttonEmoji, inline: true },
                                { name: "Button Style", value: buttonStyle, inline: true },
                                { name: "Embed Title", value: embedTitle, inline: false },
                                { name: "Embed Description", value: embedDescription, inline: false }
                            )
                            .setColor("Green")
                    ]
                });

                // STEP 2: Ask if they want categories
                const categoriesEmbed = new discord.EmbedBuilder()
                    .setTitle("📑 Ticket Categories")
                    .setDescription(
                        "Do you want to set up different categories for tickets?\n\n" +
                        "If yes, users will select a category when creating a ticket. " +
                        "If no, tickets will be created directly.\n\n" +
                        "Please type `yes` or `no`."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 2/5: Ticket Categories" });

                const categoriesMsg = await channel.send({ embeds: [categoriesEmbed] });

                const categoryDecisionCollected = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    max: 1,
                    time: 120000,
                    errors: ['time']
                });

                // Clean up user message
                try {
                    await categoryDecisionCollected.first()?.delete();
                } catch (err) {
                    client.logger.debug(`[SETUP] Could not delete message: ${err}`);
                }

                const categoryDecision = categoryDecisionCollected.first()?.content.trim().toLowerCase();

                // Check for cancel
                if (categoryDecision === "cancel") {
                    await categoriesMsg.delete().catch(() => { });
                    await buttonMsg.delete().catch(() => { });
                    return interaction.followUp({
                        embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                        ephemeral: true
                    });
                }

                const useCategories = categoryDecision === "yes";

                if (useCategories) {
                    // STEP 3: Configure categories
                    await categoriesMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("📑 Ticket Categories Configuration")
                                .setDescription(
                                    "Please enter your ticket categories, one by one.\n\n" +
                                    "Format for each category:\n" +
                                    "`Emoji | Category Name | Description | Support Role ID (optional)`\n\n" +
                                    "Example:\n" +
                                    "`🔧 | Technical Support | Get help with technical issues | 123456789012345678`\n\n" +
                                    "Type `done` when you've added all categories you want."
                                )
                                .setColor("Blue")
                                .setFooter({ text: "Step 3/5: Category Configuration" })
                        ]
                    });

                    const categories = [];
                    let categoryIndex = 1;
                    let categoryDone = false;

                    while (!categoryDone) {
                        const categoryCollected = await channel.awaitMessages({
                            filter: (m) => m.author.id === interaction.user.id,
                            max: 1,
                            time: 300000,
                            errors: ['time']
                        });

                        const categoryResponse = categoryCollected.first()?.content.trim();

                        // Clean up user message
                        try {
                            await categoryCollected.first()?.delete();
                        } catch (err) {
                            client.logger.debug(`[SETUP] Could not delete message: ${err}`);
                        }

                        // Check for done or cancel
                        if (categoryResponse?.toLowerCase() === "done") {
                            categoryDone = true;
                            continue;
                        } else if (categoryResponse?.toLowerCase() === "cancel") {
                            await categoriesMsg.delete().catch(() => { });
                            await buttonMsg.delete().catch(() => { });
                            return interaction.followUp({
                                embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                                ephemeral: true
                            });
                        }

                        // Parse category
                        if (categoryResponse) {
                            const parts = categoryResponse.split("|").map(part => part.trim());
                            const emoji = parts[0] || "📝";
                            const name = parts[1] || `Category ${categoryIndex}`;
                            const description = parts[2] || `Support for ${name}`;
                            const roleId = parts[3] || (supportersRole ? supportersRole.id : undefined);

                            // Create category in database
                            const category = await ticketRepo.createTicketCategory(interaction.guildId!, {
                                name,
                                description,
                                emoji,
                                supportRoleId: roleId,
                                position: categoryIndex - 1
                            });

                            categories.push({
                                emoji,
                                name,
                                description,
                                roleId
                            });

                            // Configure default messages for this category
                            await ticketRepo.configureTicketMessages(category.id, {
                                welcomeMessage: `Welcome to your ticket in the **${name}** category!\n\nPlease describe your issue and wait for a staff member to assist you.`,
                                closeMessage: `This ticket in the **${name}** category has been closed.`,
                                includeSupportTeam: true
                            });

                            // Send confirmation
                            await channel.send({
                                embeds: [
                                    new EmbedTemplate(client).success(`Added category: ${emoji} **${name}**`)
                                        .setFooter({ text: `Category ${categoryIndex} added` })
                                ]
                            }).then(msg => {
                                setTimeout(() => {
                                    msg.delete().catch(() => { });
                                }, 5000);
                            });

                            categoryIndex++;
                        }
                    }

                    // Configure select menu
                    await ticketRepo.configureSelectMenu(interaction.guildId!, {
                        placeholder: "Select a ticket category",
                        minValues: 1,
                        maxValues: 1,
                        embedTitle: "Create a Ticket",
                        embedDescription: "Please select a category for your ticket"
                    });

                    // Display summary of categories
                    let categoryList = "";
                    categories.forEach((cat, index) => {
                        categoryList += `${index + 1}. ${cat.emoji} **${cat.name}** - ${cat.description}\n`;
                    });

                    await categoriesMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("📑 Ticket Categories Configured")
                                .setDescription(
                                    `Successfully configured ${categories.length} categories:\n\n${categoryList}`
                                )
                                .setColor("Green")
                        ]
                    });
                } else {
                    // No categories, update message
                    await categoriesMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("📑 Ticket Categories")
                                .setDescription("You've chosen not to use categories. Tickets will be created directly.")
                                .setColor("Green")
                        ]
                    });

                    // Create a default category
                    const defaultCategory = await ticketRepo.createTicketCategory(interaction.guildId!, {
                        name: "General Support",
                        description: "General support tickets",
                        emoji: "🎫",
                        supportRoleId: supportersRole ? supportersRole.id : undefined,
                        position: 0
                    });

                    // Configure default messages for this category
                    await ticketRepo.configureTicketMessages(defaultCategory.id, {
                        welcomeMessage: "Welcome to your ticket!\n\nPlease describe your issue and wait for a staff member to assist you.",
                        closeMessage: "This ticket has been closed.",
                        includeSupportTeam: true
                    });
                }

                // STEP 4: Ticket Message Customization
                const messageCustomizationEmbed = new discord.EmbedBuilder()
                    .setTitle("💬 Ticket Messages")
                    .setDescription(
                        "Would you like to customize the welcome and closing messages for tickets?\n\n" +
                        "Default messages have been set, but you can customize them later with the `/ticket config` command.\n\n" +
                        "Type `yes` to customize now, or `no` to keep defaults."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 4/5: Message Customization" });

                const messageCustomizationMsg = await channel.send({ embeds: [messageCustomizationEmbed] });

                const messageDecisionCollected = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    max: 1,
                    time: 120000,
                    errors: ['time']
                });

                // Clean up user message
                try {
                    await messageDecisionCollected.first()?.delete();
                } catch (err) {
                    client.logger.debug(`[SETUP] Could not delete message: ${err}`);
                }

                const messageDecision = messageDecisionCollected.first()?.content.trim().toLowerCase();

                // Check for cancel
                if (messageDecision === "cancel") {
                    await messageCustomizationMsg.delete().catch(() => { });
                    await categoriesMsg.delete().catch(() => { });
                    await buttonMsg.delete().catch(() => { });
                    return interaction.followUp({
                        embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                        ephemeral: true
                    });
                }

                if (messageDecision === "yes") {
                    // You would implement message customization here
                    // For simplicity, we'll skip detailed implementation and just acknowledge
                    await messageCustomizationMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("💬 Message Customization")
                                .setDescription(
                                    "Message customization can be done later with the `/ticket config` command.\n\n" +
                                    "For now, we'll use the default messages."
                                )
                                .setColor("Green")
                        ]
                    });
                } else {
                    await messageCustomizationMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("💬 Ticket Messages")
                                .setDescription(
                                    "Using default ticket messages. You can customize them later with the `/ticket config` command."
                                )
                                .setColor("Green")
                        ]
                    });
                }

                // STEP 5: Deploy the ticket system
                const deployEmbed = new discord.EmbedBuilder()
                    .setTitle("🚀 Deploy Ticket System")
                    .setDescription(
                        "Your ticket system is configured! Ready to deploy it now?\n\n" +
                        "This will create the ticket panel in the specified channel.\n\n" +
                        "Type `deploy` to create the panel, or `later` to deploy it manually later."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 5/5: Deployment" });

                const deployMsg = await channel.send({ embeds: [deployEmbed] });

                const deployDecisionCollected = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    max: 1,
                    time: 120000,
                    errors: ['time']
                });

                // Clean up user message
                try {
                    await deployDecisionCollected.first()?.delete();
                } catch (err) {
                    client.logger.debug(`[SETUP] Could not delete message: ${err}`);
                }

                const deployDecision = deployDecisionCollected.first()?.content.trim().toLowerCase();

                // Check for cancel
                if (deployDecision === "cancel") {
                    await deployMsg.delete().catch(() => { });
                    await messageCustomizationMsg.delete().catch(() => { });
                    await categoriesMsg.delete().catch(() => { });
                    await buttonMsg.delete().catch(() => { });
                    return interaction.followUp({
                        embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                        ephemeral: true
                    });
                }

                if (deployDecision === "deploy") {
                    // Get the button and ticket configuration
                    const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);

                    if (!buttonConfig) {
                        return deployMsg.edit({
                            embeds: [
                                new discord.EmbedBuilder()
                                    .setTitle("❌ Deployment Failed")
                                    .setDescription("Button configuration not found. Please try setup again.")
                                    .setColor("Red")
                            ]
                        });
                    }

                    // Create the ticket panel
                    const ticketButtonChannel = client.channels.cache.get(ticketChannel.id) as discord.TextChannel;

                    if (!ticketButtonChannel) {
                        return deployMsg.edit({
                            embeds: [
                                new discord.EmbedBuilder()
                                    .setTitle("❌ Deployment Failed")
                                    .setDescription("Ticket channel not found. Has it been deleted?")
                                    .setColor("Red")
                            ]
                        });
                    }

                    // Create the embed
                    const ticketEmbed = new discord.EmbedBuilder()
                        .setTitle(buttonConfig.embedTitle || "Need Help?")
                        .setDescription(buttonConfig.embedDescription || "Click the button below to create a ticket")
                        .setColor((buttonConfig.embedColor || "#5865F2") as discord.ColorResolvable)
                        .setFooter({ text: "Powered by Salt Bot", iconURL: client.user?.displayAvatarURL() })
                        .setTimestamp();

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
                                .setLabel(buttonConfig.label)
                                .setEmoji(buttonConfig.emoji)
                                .setStyle(style)
                        );

                    // Send the panel
                    const panelMessage = await ticketButtonChannel.send({
                        embeds: [ticketEmbed],
                        components: [buttonRow]
                    });

                    // Update the message ID in the database
                    await ticketRepo.configureTicketButton(interaction.guildId!, {
                        messageId: panelMessage.id
                    });

                    // If using categories, update select menu config
                    if (useCategories) {
                        await ticketRepo.configureSelectMenu(interaction.guildId!, {
                            messageId: panelMessage.id
                        });
                    }

                    await deployMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("🎉 Ticket System Deployed")
                                .setDescription(`Your ticket system has been deployed in ${ticketButtonChannel}!`)
                                .setColor("Green")
                        ]
                    });
                } else {
                    await deployMsg.edit({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("📝 Deployment Postponed")
                                .setDescription(
                                    "You can deploy the ticket panel later using the `/ticket deploy` command.\n\n" +
                                    "Your settings have been saved."
                                )
                                .setColor("Orange")
                        ]
                    });
                }

                // Final followUp
                return interaction.followUp({
                    embeds: [
                        new EmbedTemplate(client).success("✅ Ticket system setup complete!")
                            .setDescription(
                                "Your ticket system has been configured successfully.\n\n" +
                                "You can manage it with the following commands:\n" +
                                "- `/ticket deploy` - Deploy the ticket panel\n" +
                                "- `/ticket config` - Configure ticket settings\n" +
                                "- `/stop` - Disable the ticket system"
                            )
                    ]
                });

            } catch (error) {
                client.logger.error(`[SETUP] Error during ticket setup: ${error}`);
                return interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("Setup timed out or failed. Please try again.")]
                });
            }

        } catch (error) {
            client.logger.error(`[SETUP] Error in setup command: ${error}`);

            // Try to respond if possible
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                    ephemeral: true
                });
            }
        }
    }
};

export default setupCommand;