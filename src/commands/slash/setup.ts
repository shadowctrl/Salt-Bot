import discord from "discord.js";
import { EmbedTemplate } from "../../utils/embed_template";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { SlashCommand } from "../../types";

// Helper function to create navigation buttons
const createNavigationButtons = (
    previousId: string = "previous",
    nextId: string = "next",
    cancelId: string = "cancel",
    disablePrevious: boolean = false,
    disableNext: boolean = false
) => {
    return new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId(previousId)
                .setLabel("Previous")
                .setStyle(discord.ButtonStyle.Secondary)
                .setDisabled(disablePrevious),
            new discord.ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel("Cancel Setup")
                .setStyle(discord.ButtonStyle.Danger),
            new discord.ButtonBuilder()
                .setCustomId(nextId)
                .setLabel("Next")
                .setStyle(discord.ButtonStyle.Primary)
                .setDisabled(disableNext)
        );
};

// Helper function to create yes/no buttons
const createYesNoButtons = (
    yesId: string = "yes",
    noId: string = "no",
    cancelId: string = "cancel"
) => {
    return new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId(yesId)
                .setLabel("Yes")
                .setStyle(discord.ButtonStyle.Success),
            new discord.ButtonBuilder()
                .setCustomId(noId)
                .setLabel("No")
                .setStyle(discord.ButtonStyle.Secondary),
            new discord.ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel("Cancel Setup")
                .setStyle(discord.ButtonStyle.Danger)
        );
};

// Helper function to create confirmation buttons
const createConfirmButtons = (
    confirmId: string = "confirm",
    cancelId: string = "cancel"
) => {
    return new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId(confirmId)
                .setLabel("Confirm")
                .setStyle(discord.ButtonStyle.Success),
            new discord.ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel("Cancel")
                .setStyle(discord.ButtonStyle.Danger)
        );
};

// Helper function to create deploy buttons
const createDeployButtons = () => {
    return new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId("deploy")
                .setLabel("Deploy Now")
                .setStyle(discord.ButtonStyle.Success)
                .setEmoji("🚀"),
            new discord.ButtonBuilder()
                .setCustomId("later")
                .setLabel("Deploy Later")
                .setStyle(discord.ButtonStyle.Secondary),
            new discord.ButtonBuilder()
                .setCustomId("cancel")
                .setLabel("Cancel Setup")
                .setStyle(discord.ButtonStyle.Danger)
        );
};

// Helper function to create button styles dropdown
const createButtonStyleSelect = () => {
    return new discord.ActionRowBuilder<discord.StringSelectMenuBuilder>()
        .addComponents(
            new discord.StringSelectMenuBuilder()
                .setCustomId("button_style")
                .setPlaceholder("Select a button style")
                .addOptions([
                    {
                        label: "Blue",
                        description: "Blue button style",
                        value: "PRIMARY",
                        emoji: "🔵"
                    },
                    {
                        label: "Grey",
                        description: "Grey button style",
                        value: "SECONDARY",
                        emoji: "⚪"
                    },
                    {
                        label: "Green",
                        description: "Green button style",
                        value: "SUCCESS",
                        emoji: "🟢"
                    },
                    {
                        label: "Red",
                        description: "Red button style",
                        value: "DANGER",
                        emoji: "🔴"
                    }
                ])
        );
};

// Helper function to create "done adding categories" button
const createDoneAddingButton = () => {
    return new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId("done_adding")
                .setLabel("Done Adding Categories")
                .setStyle(discord.ButtonStyle.Primary),
            new discord.ButtonBuilder()
                .setCustomId("cancel")
                .setLabel("Cancel Setup")
                .setStyle(discord.ButtonStyle.Danger)
        );
};

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
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('transcript_channel')
                .setDescription('Channel where ticket transcripts will be sent')
                .addChannelTypes(discord.ChannelType.GuildText)
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

            // Get specified transcript channel or leave it null
            const transcriptChannel = interaction.options.getChannel("transcript_channel");

            // Setup initial configuration
            const setupEmbed = new discord.EmbedBuilder()
                .setTitle("🎫 Ticket System Setup")
                .setDescription(
                    "Let's set up your ticket system! We'll walk you through the configuration process " +
                    "step by step using buttons for easier navigation.\n\n" +
                    "You can cancel the setup at any time by clicking the Cancel button."
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

            // Initial button configuration with next button
            const initialButtons = createNavigationButtons("previous", "next", "cancel", true, false);

            // Send the initial setup message with buttons
            const setupMessage = await interaction.editReply({
                embeds: [setupEmbed],
                components: [initialButtons]
            });

            // Create button collector for the setup process
            const collector = (setupMessage as discord.Message).createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: 600000 // 10 minutes timeout
            })

            // Store setup data
            let setupData = {
                step: 1,
                buttonConfig: {
                    label: "Create Ticket",
                    emoji: "🎫",
                    style: "PRIMARY",
                    embedTitle: "Need Help?",
                    embedDescription: "Click the button below to create a ticket!"
                },
                useCategories: false,
                categories: [] as any[],
                customizeMessages: false
            };

            // Handle button interactions
            collector.on("collect", async (i: discord.MessageComponentInteraction) => {
                try {
                    try {
                        await i.deferUpdate();
                    } catch (deferError) {
                        client.logger.warn(`[SETUP] Failed to defer update: ${deferError}`);
                        return;
                    }

                    // Handle cancel button across all steps
                    if (i.customId === "cancel") {
                        await i.editReply({
                            embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                            components: []
                        });
                        collector.stop();
                        return;
                    }

                    // Handle navigation and step-specific actions based on the current step
                    switch (setupData.step) {
                        case 1: // Ticket Button Configuration
                            if (i.customId === "next") {
                                // Move to button customization step
                                await handleButtonCustomization(i);
                            }
                            break;

                        case 2: // Button style selection
                            if (i.isStringSelectMenu() && i.customId === "button_style") {
                                setupData.buttonConfig.style = i.values[0];

                                const styleEmbed = new discord.EmbedBuilder()
                                    .setTitle("🔘 Button Style Selected")
                                    .setDescription(`You selected the ${i.values[0].toLowerCase()} button style.`)
                                    .setColor("Green");

                                await i.editReply({
                                    embeds: [styleEmbed],
                                    components: [createNavigationButtons("back_to_button", "continue_button")]
                                });
                            } else if (i.customId === "back_to_button") {
                                await handleButtonCustomization(i);
                            } else if (i.customId === "continue_button") {
                                // Configure button in database
                                await ticketRepo.configureTicketButton(interaction.guildId!, {
                                    label: setupData.buttonConfig.label,
                                    emoji: setupData.buttonConfig.emoji,
                                    style: setupData.buttonConfig.style,
                                    channelId: ticketChannel.id,
                                    embedTitle: setupData.buttonConfig.embedTitle,
                                    embedDescription: setupData.buttonConfig.embedDescription,
                                    logChannelId: transcriptChannel ? transcriptChannel.id : null
                                });

                                // Move to categories step
                                setupData.step = 3;
                                await handleCategoriesStep(i);
                            }
                            break;

                        case 3: // Categories configuration
                            if (i.customId === "yes") {
                                setupData.useCategories = true;
                                await handleCategoryCreation(i);
                            } else if (i.customId === "no") {
                                setupData.useCategories = false;

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

                                // Move to message customization step
                                setupData.step = 4;
                                await handleMessageCustomization(i);
                            }
                            break;

                        case 3.5: // Category creation
                            if (i.customId === "done_adding") {
                                // Configure select menu if using categories
                                await ticketRepo.configureSelectMenu(interaction.guildId!, {
                                    placeholder: "Select a ticket category",
                                    minValues: 1,
                                    maxValues: 1,
                                    embedTitle: "Create a Ticket",
                                    embedDescription: "Please select a category for your ticket"
                                });

                                // Move to message customization step
                                setupData.step = 4;
                                await handleMessageCustomization(i);
                            }
                            break;

                        case 4: // Message Customization
                            if (i.customId === "yes") {
                                setupData.customizeMessages = true;
                                await handleMessageCustomizationLater(i);
                            } else if (i.customId === "no") {
                                setupData.customizeMessages = false;

                                // Move to deployment step
                                setupData.step = 5;
                                await handleDeployment(i);
                            }
                            break;

                        case 5: // Deployment
                            if (i.customId === "deploy") {
                                await handleDeployTicketSystem(i, ticketChannel, setupData.useCategories);
                            } else if (i.customId === "later") {
                                await i.editReply({
                                    embeds: [
                                        new discord.EmbedBuilder()
                                            .setTitle("📝 Deployment Postponed")
                                            .setDescription(
                                                "You can deploy the ticket panel later using the `/ticket deploy` command.\n\n" +
                                                "Your settings have been saved."
                                            )
                                            .setColor("Orange")
                                    ],
                                    components: []
                                });

                                // Send final confirmation
                                await interaction.followUp({
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

                                collector.stop();
                            }
                            break;
                    }

                } catch (error) {
                    client.logger.error(`[SETUP] Error handling button interaction: ${error}`);
                    await i.editReply({
                        embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                        components: []
                    }).catch(() => {/* Ignore failures here */ });
                    collector.stop();
                }
            });

            // Handle collector end (timeout or manual stop)
            collector.on("end", async (collected, reason) => {
                if (reason === "time") {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Setup timed out. Please try again.")],
                        components: []
                    });
                }
            });

            // Handler for button customization step
            const handleButtonCustomization = async (i: discord.MessageComponentInteraction) => {
                setupData.step = 2;

                const buttonConfigEmbed = new discord.EmbedBuilder()
                    .setTitle("🔘 Ticket Button Configuration")
                    .setDescription(
                        "Let's configure the ticket creation button.\n\n" +
                        "First, select a style for your button below."
                    )
                    .setFields(
                        { name: "Label", value: setupData.buttonConfig.label, inline: true },
                        { name: "Emoji", value: setupData.buttonConfig.emoji, inline: true },
                        { name: "Style", value: setupData.buttonConfig.style, inline: true },
                        { name: "Embed Title", value: setupData.buttonConfig.embedTitle, inline: false },
                        { name: "Embed Description", value: setupData.buttonConfig.embedDescription, inline: false }
                    )
                    .setColor("Blue")
                    .setFooter({ text: "You can customize more button options later with /ticket config" });

                await i.editReply({
                    embeds: [buttonConfigEmbed],
                    components: [createButtonStyleSelect()]
                });
            };

            // Handler for categories step
            const handleCategoriesStep = async (i: discord.MessageComponentInteraction) => {
                const categoriesEmbed = new discord.EmbedBuilder()
                    .setTitle("📑 Ticket Categories")
                    .setDescription(
                        "Do you want to set up different categories for tickets?\n\n" +
                        "If yes, users will select a category when creating a ticket. " +
                        "If no, tickets will be created directly."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 3/5: Ticket Categories" });

                await i.editReply({
                    embeds: [categoriesEmbed],
                    components: [createYesNoButtons()]
                });
            };

            // Handler for category creation
            const handleCategoryCreation = async (i: discord.MessageComponentInteraction) => {
                setupData.step = 3.5;

                const categoryCreationEmbed = new discord.EmbedBuilder()
                    .setTitle("📑 Ticket Categories Configuration")
                    .setDescription(
                        "Please enter your ticket categories, one by one.\n\n" +
                        "Format for each category:\n" +
                        "`Emoji | Category Name | Description | Support Role ID (optional)`\n\n" +
                        "Example:\n" +
                        "`🔧 | Technical Support | Get help with technical issues | 123456789012345678`\n\n" +
                        "Type each category in the chat, then click 'Done Adding Categories' when finished."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 3/5: Category Configuration" });

                await i.editReply({
                    embeds: [categoryCreationEmbed],
                    components: [createDoneAddingButton()]
                });

                // Set up message collector to gather category information
                const channel = interaction.channel as discord.TextChannel;

                if (!channel) return;

                const categoryMessageCollector = channel.createMessageCollector({
                    filter: (m) => m.author.id === interaction.user.id && m.content !== "",
                    time: 300000 // 5 minutes timeout
                });

                let categoryIndex = 1;

                categoryMessageCollector.on("collect", async (message) => {
                    try {
                        // Parse category information
                        const parts = message.content.split("|").map(part => part.trim());
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

                        setupData.categories.push({
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
                        const chan = message.channel as discord.TextChannel;
                        const confirmMessage = await chan.send({
                            embeds: [
                                new EmbedTemplate(client).success(`Added category: ${emoji} **${name}**`)
                                    .setFooter({ text: `Category ${categoryIndex} added` })
                            ]
                        });

                        // Delete user message
                        await message.delete().catch(() => { });

                        // Delete confirmation after 3 seconds
                        setTimeout(() => {
                            confirmMessage.delete().catch(() => { });
                        }, 3000);

                        categoryIndex++;

                        // Update category list in setup message
                        let categoryList = "";
                        setupData.categories.forEach((cat, index) => {
                            categoryList += `${index + 1}. ${cat.emoji} **${cat.name}** - ${cat.description}\n`;
                        });

                        const updatedEmbed = new discord.EmbedBuilder()
                            .setTitle("📑 Ticket Categories Configuration")
                            .setDescription(
                                "Please enter your ticket categories, one by one.\n\n" +
                                "Format for each category:\n" +
                                "`Emoji | Category Name | Description | Support Role ID (optional)`\n\n" +
                                "Click 'Done Adding Categories' when finished.\n\n" +
                                `**Added Categories:**\n${categoryList}`
                            )
                            .setColor("Blue")
                            .setFooter({ text: `Step 3/5: Currently ${setupData.categories.length} categories added` });

                        await i.editReply({
                            embeds: [updatedEmbed],
                            components: [createDoneAddingButton()]
                        });

                    } catch (error) {
                        client.logger.error(`[SETUP] Error creating category: ${error}`);
                        const chan = message.channel as discord.TextChannel;
                        await chan.send({
                            embeds: [new EmbedTemplate(client).error("Error creating category. Please try again with correct format.")]
                        }).then((msg: discord.Message) => {
                            setTimeout(() => {
                                msg.delete().catch(() => { });
                            }, 5000);
                        });

                        // Delete user message
                        await message.delete().catch(() => { });
                    }
                });

                // Stop the category collector when the done button is pressed
                collector.on("collect", (btnInteraction) => {
                    if (btnInteraction.customId === "done_adding" || btnInteraction.customId === "cancel") {
                        categoryMessageCollector.stop();
                    }
                });
            };

            // Handler for message customization step
            const handleMessageCustomization = async (i: discord.MessageComponentInteraction) => {
                setupData.step = 4;

                const messageCustomizationEmbed = new discord.EmbedBuilder()
                    .setTitle("💬 Ticket Messages")
                    .setDescription(
                        "Would you like to customize the welcome and closing messages for tickets?\n\n" +
                        "Default messages have been set, but you can customize them now or later with the `/ticket config` command."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 4/5: Message Customization" });

                await i.editReply({
                    embeds: [messageCustomizationEmbed],
                    components: [createYesNoButtons("yes", "no", "cancel")]
                });
            };

            // Handler for the placeholder message customization
            const handleMessageCustomizationLater = async (i: discord.MessageComponentInteraction) => {
                await i.editReply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("💬 Message Customization")
                            .setDescription(
                                "Message customization can be done with the `/ticket config` command.\n\n" +
                                "For now, we'll use the default messages and move to the next step."
                            )
                            .setColor("Green")
                    ],
                    components: [createNavigationButtons("prev_msg", "next_deploy", "cancel", true, false)]
                });

                // Handle button to move to deployment with proper error handling
                try {
                    const nextBtn = await (i.message as discord.Message).awaitMessageComponent({
                        filter: (i) => i.user.id === interaction.user.id,
                        time: 60000
                    });

                    try {
                        // Important: Defer the update FIRST before any processing
                        await nextBtn.deferUpdate().catch(err => {
                            client.logger.warn(`[SETUP] Failed to defer next button update: ${err}`);
                        });

                        if (nextBtn.customId === "next_deploy") {
                            setupData.step = 5;
                            await handleDeployment(nextBtn);
                        } else if (nextBtn.customId === "cancel") {
                            await nextBtn.editReply({
                                embeds: [new EmbedTemplate(client).info("Setup canceled.")],
                                components: []
                            }).catch(err => client.logger.error(`[SETUP] Error with cancel: ${err}`));
                            collector.stop();
                        }
                    } catch (deferError) {
                        client.logger.error(`[SETUP] Error with button interaction: ${deferError}`);
                        // At this point we can't use the interaction anymore
                        await i.editReply({
                            embeds: [new EmbedTemplate(client).error("An error occurred with the interaction.")],
                            components: []
                        }).catch(() => {/* Ignore failures here */ });
                    }
                } catch (timeoutError) {
                    // This catches the timeout error from awaitMessageComponent
                    client.logger.warn(`[SETUP] Button interaction timed out: ${timeoutError}`);
                    await i.editReply({
                        embeds: [new EmbedTemplate(client).error("Setup timed out. Please try again.")],
                        components: []
                    }).catch(() => {/* Ignore failures here */ });
                }
            };

            // Handler for deployment step
            const handleDeployment = async (i: discord.MessageComponentInteraction) => {
                const deployEmbed = new discord.EmbedBuilder()
                    .setTitle("🚀 Deploy Ticket System")
                    .setDescription(
                        "Your ticket system is configured! Ready to deploy it now?\n\n" +
                        "This will create the ticket panel in the specified channel.\n\n" +
                        "Click 'Deploy Now' to create the panel, or 'Deploy Later' to deploy it manually later."
                    )
                    .setColor("Blue")
                    .setFooter({ text: "Step 5/5: Deployment" });

                await i.editReply({
                    embeds: [deployEmbed],
                    components: [createDeployButtons()]
                });
            };

            // Handler for deploying the ticket system
            const handleDeployTicketSystem = async (
                i: discord.MessageComponentInteraction,
                ticketChannel: discord.TextChannel,
                useCategories: boolean
            ) => {
                try {
                    // Show loading state
                    await i.editReply({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("⏳ Deploying Ticket System")
                                .setDescription("Please wait while we deploy your ticket system...")
                                .setColor("Blue")
                        ],
                        components: []
                    });

                    // Get the button and ticket configuration
                    const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);

                    if (!buttonConfig) {
                        return i.editReply({
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
                        return i.editReply({
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

                    // Send confirmation message
                    await i.editReply({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("🎉 Ticket System Deployed")
                                .setDescription(`Your ticket system has been deployed in ${ticketButtonChannel}!\n\nUsers can now create tickets by clicking the button.`)
                                .setColor("Green")
                                .setTimestamp()
                        ],
                        components: []
                    });

                    // Send final success message
                    await interaction.followUp({
                        embeds: [
                            new EmbedTemplate(client).success("✅ Ticket System Setup Complete!")
                                .setDescription(
                                    "Your ticket system has been configured and deployed successfully.\n\n" +
                                    "You can manage it with the following commands:\n" +
                                    "- `/ticket config` - Configure ticket settings\n" +
                                    "- `/stop` - Disable the ticket system or remove the panel"
                                )
                        ]
                    });

                    collector.stop("completed");
                } catch (error) {
                    client.logger.error(`[SETUP] Error deploying ticket system: ${error}`);
                    await i.editReply({
                        embeds: [new EmbedTemplate(client).error("An error occurred while deploying the ticket system.")],
                        components: []
                    });
                }
            };

        } catch (error) {
            client.logger.error(`[SETUP] Error in setup command: ${error}`);

            // Try to respond if possible
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        }
    }
};

export default setupCommand;