import discord from "discord.js";
import { EmbedTemplate } from "../../utils/embed_template";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { SlashCommand } from "../../types";

/**
 * Setup Manager class to handle ticket system configuration
 */
class SetupManager {
    private interaction: discord.ChatInputCommandInteraction;
    private client: discord.Client;
    private ticketRepo: TicketRepository;
    private collector: discord.InteractionCollector<discord.ButtonInteraction | discord.StringSelectMenuInteraction>;
    private ticketChannel: discord.TextChannel;
    private supportersRole: discord.Role | null;
    private transcriptChannel: discord.Channel | null;
    private setupData: {
        step: number;
        buttonConfig: {
            label: string;
            emoji: string;
            style: string;
            embedTitle: string;
            embedDescription: string;
        };
        useCategories: boolean;
        categories: any[];
        customizeMessages: boolean;
    };

    /**
     * Create a new setup manager instance
     */
    constructor(
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client,
        ticketRepo: TicketRepository,
        ticketChannel: discord.TextChannel,
        supportersRole: discord.Role | null,
        transcriptChannel: discord.Channel | null
    ) {
        this.interaction = interaction;
        this.client = client;
        this.ticketRepo = ticketRepo;
        this.ticketChannel = ticketChannel;
        this.supportersRole = supportersRole;
        this.transcriptChannel = transcriptChannel;
        this.collector = null as any; // Will be initialized later

        // Default setup data
        this.setupData = {
            step: 1,
            buttonConfig: {
                label: "Create Ticket",
                emoji: "🎫",
                style: "PRIMARY",
                embedTitle: "Need Help?",
                embedDescription: "Click the button below to create a ticket!"
            },
            useCategories: false,
            categories: [],
            customizeMessages: false
        };
    }

    /**
     * Start the setup process
     */
    public async start(): Promise<void> {
        try {
            // Create initial configuration
            const setupEmbed = new discord.EmbedBuilder()
                .setTitle("🎫 Ticket System Setup")
                .setDescription(
                    "Let's set up your ticket system! We'll walk you through the configuration process " +
                    "step by step using buttons for easier navigation.\n\n" +
                    "You can cancel the setup at any time by clicking the Cancel button."
                )
                .addFields(
                    { name: "Ticket Channel", value: `${this.ticketChannel}`, inline: true },
                    {
                        name: "Support Role",
                        value: this.supportersRole ? `${this.supportersRole}` : "Not specified",
                        inline: true
                    }
                )
                .setColor("Blue")
                .setFooter({ text: "Step 1/5: Ticket Button Configuration" });

            // Initial button configuration with next button
            const initialButtons = this.createNavigationButtons("previous", "next", "cancel", true, false);

            // Send the initial setup message with buttons
            const setupMessage = await this.interaction.editReply({
                embeds: [setupEmbed],
                components: [initialButtons]
            });

            // Create collector for buttons
            this.collector = (setupMessage as discord.Message).createMessageComponentCollector({
                filter: (i) => i.user.id === this.interaction.user.id,
                time: 600000 // 10 minutes timeout
            }) as discord.InteractionCollector<discord.ButtonInteraction | discord.StringSelectMenuInteraction>;

            // Handle collector events
            this.setupCollector();
        } catch (error) {
            this.client.logger.error(`[SETUP] Error starting setup: ${error}`);
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("An error occurred during setup initialization.")]
            });
        }
    }

    /**
     * Setup the collector for button interactions
     */
    private setupCollector(): void {
        this.collector.on("collect", async (i: discord.MessageComponentInteraction) => {
            try {
                // Always defer update first to prevent interaction timeouts
                await i.deferUpdate().catch(err => {
                    this.client.logger.warn(`[SETUP] Failed to defer update: ${err}`);
                });

                // Handle cancel button across all steps
                if (i.customId === "cancel") {
                    await i.editReply({
                        embeds: [new EmbedTemplate(this.client).info("Setup canceled.")],
                        components: []
                    }).catch(err => {
                        this.client.logger.error(`[SETUP] Error responding to cancel: ${err}`);
                    });
                    this.collector.stop();
                    return;
                }

                // Handle different steps
                await this.handleStep(i);
            } catch (error) {
                this.client.logger.error(`[SETUP] Error handling button interaction: ${error}`);

                // Try to respond with an error message
                try {
                    await i.editReply({
                        embeds: [new EmbedTemplate(this.client).error("An error occurred during setup.")],
                        components: []
                    });
                } catch (replyError) {
                    this.client.logger.error(`[SETUP] Failed to send error reply: ${replyError}`);
                }

                this.collector.stop();
            }
        });

        // Handle collector end (timeout or manual stop)
        this.collector.on("end", async (collected, reason) => {
            if (reason === "time") {
                await this.interaction.editReply({
                    embeds: [new EmbedTemplate(this.client).error("Setup timed out. Please try again.")],
                    components: []
                }).catch(err => {
                    this.client.logger.error(`[SETUP] Error responding to timeout: ${err}`);
                });
            }
        });
    }

    /**
     * Handle the current step based on the interaction
     */
    private async handleStep(i: discord.MessageComponentInteraction): Promise<void> {
        switch (this.setupData.step) {
            case 1: // Ticket Button Configuration
                if (i.customId === "next") {
                    await this.handleButtonCustomization(i);
                }
                break;

            case 2: // Button style selection
                await this.handleButtonStyleSelection(i);
                break;

            case 3: // Categories configuration
                await this.handleCategoriesStep(i);
                break;

            case 3.5: // Category creation
                if (i.customId === "done_adding") {
                    await this.finalizeCategoryCreation(i);
                }
                break;

            case 4: // Message Customization
                await this.handleMessageCustomization(i);
                break;

            case 5: // Deployment
                await this.handleDeployment(i);
                break;
        }
    }

    /**
     * Create navigation buttons
     */
    private createNavigationButtons(
        previousId: string = "previous",
        nextId: string = "next",
        cancelId: string = "cancel",
        disablePrevious: boolean = false,
        disableNext: boolean = false
    ): discord.ActionRowBuilder<discord.ButtonBuilder> {
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
    }

    /**
     * Create yes/no buttons
     */
    private createYesNoButtons(
        yesId: string = "yes",
        noId: string = "no",
        cancelId: string = "cancel"
    ): discord.ActionRowBuilder<discord.ButtonBuilder> {
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
    }

    /**
     * Create deploy buttons
     */
    private createDeployButtons(): discord.ActionRowBuilder<discord.ButtonBuilder> {
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
    }

    /**
     * Create button styles dropdown
     */
    private createButtonStyleSelect(): discord.ActionRowBuilder<discord.StringSelectMenuBuilder> {
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
    }

    /**
     * Create "done adding categories" button
     */
    private createDoneAddingButton(): discord.ActionRowBuilder<discord.ButtonBuilder> {
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
    }

    /**
     * Handle button customization step
     */
    private async handleButtonCustomization(i: discord.MessageComponentInteraction): Promise<void> {
        this.setupData.step = 2;

        const buttonConfigEmbed = new discord.EmbedBuilder()
            .setTitle("🔘 Ticket Button Configuration")
            .setDescription(
                "Let's configure the ticket creation button.\n\n" +
                "First, select a style for your button below."
            )
            .setFields(
                { name: "Label", value: this.setupData.buttonConfig.label, inline: true },
                { name: "Emoji", value: this.setupData.buttonConfig.emoji, inline: true },
                { name: "Style", value: this.setupData.buttonConfig.style, inline: true },
                { name: "Embed Title", value: this.setupData.buttonConfig.embedTitle, inline: false },
                { name: "Embed Description", value: this.setupData.buttonConfig.embedDescription, inline: false }
            )
            .setColor("Blue")
            .setFooter({ text: "You can customize more button options later with /ticket config" });

        await i.editReply({
            embeds: [buttonConfigEmbed],
            components: [this.createButtonStyleSelect()]
        });
    }

    /**
     * Handle button style selection
     */
    private async handleButtonStyleSelection(i: discord.MessageComponentInteraction): Promise<void> {
        if (i.isStringSelectMenu() && i.customId === "button_style") {
            this.setupData.buttonConfig.style = i.values[0];

            const styleEmbed = new discord.EmbedBuilder()
                .setTitle("🔘 Button Style Selected")
                .setDescription(`You selected the ${i.values[0].toLowerCase()} button style.`)
                .setColor("Green");

            await i.editReply({
                embeds: [styleEmbed],
                components: [this.createNavigationButtons("back_to_button", "continue_button")]
            });
        } else if (i.customId === "back_to_button") {
            await this.handleButtonCustomization(i);
        } else if (i.customId === "continue_button") {
            // Configure button in database
            await this.ticketRepo.configureTicketButton(this.interaction.guildId!, {
                label: this.setupData.buttonConfig.label,
                emoji: this.setupData.buttonConfig.emoji,
                style: this.setupData.buttonConfig.style,
                channelId: this.ticketChannel.id,
                embedTitle: this.setupData.buttonConfig.embedTitle,
                embedDescription: this.setupData.buttonConfig.embedDescription,
                logChannelId: this.transcriptChannel ? this.transcriptChannel.id : undefined
            });

            // Move to categories step
            this.setupData.step = 3;
            await this.handleCategoriesStep(i);
        }
    }

    /**
     * Handle categories step
     */
    private async handleCategoriesStep(i: discord.MessageComponentInteraction): Promise<void> {
        if (i.customId === "yes") {
            this.setupData.useCategories = true;
            await this.handleCategoryCreation(i);
        } else if (i.customId === "no") {
            this.setupData.useCategories = false;

            // Create a default category
            const defaultCategory = await this.ticketRepo.createTicketCategory(this.interaction.guildId!, {
                name: "General Support",
                description: "General support tickets",
                emoji: "🎫",
                supportRoleId: this.supportersRole ? this.supportersRole.id : undefined,
                position: 0
            });

            // Configure default messages for this category
            await this.ticketRepo.configureTicketMessages(defaultCategory.id, {
                welcomeMessage: "Welcome to your ticket!\n\nPlease describe your issue and wait for a staff member to assist you.",
                closeMessage: "This ticket has been closed.",
                includeSupportTeam: true
            });

            // Move to message customization step
            this.setupData.step = 4;
            await this.handleMessageCustomizationPrompt(i);
        } else {
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
                components: [this.createYesNoButtons()]
            });
        }
    }

    /**
     * Handle category creation
     */
    private async handleCategoryCreation(i: discord.MessageComponentInteraction): Promise<void> {
        this.setupData.step = 3.5;

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
            components: [this.createDoneAddingButton()]
        });

        // Setup message collector for category creation
        await this.setupCategoryCollector();
    }

    /**
     * Setup category message collector
     */
    private async setupCategoryCollector(): Promise<void> {
        const channel = this.interaction.channel as discord.TextChannel;
        if (!channel) return;

        const categoryMessageCollector = channel.createMessageCollector({
            filter: (m) => m.author.id === this.interaction.user.id && m.content !== "",
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
                const roleId = parts[3] || (this.supportersRole ? this.supportersRole.id : undefined);

                // Create category in database
                const category = await this.ticketRepo.createTicketCategory(this.interaction.guildId!, {
                    name,
                    description,
                    emoji,
                    supportRoleId: roleId,
                    position: categoryIndex - 1
                });

                this.setupData.categories.push({
                    emoji,
                    name,
                    description,
                    roleId
                });

                // Configure default messages for this category
                await this.ticketRepo.configureTicketMessages(category.id, {
                    welcomeMessage: `Welcome to your ticket in the **${name}** category!\n\nPlease describe your issue and wait for a staff member to assist you.`,
                    closeMessage: `This ticket in the **${name}** category has been closed.`,
                    includeSupportTeam: true
                });

                // Send confirmation
                const confirmMessage = await channel.send({
                    embeds: [
                        new EmbedTemplate(this.client).success(`Added category: ${emoji} **${name}**`)
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
                this.setupData.categories.forEach((cat, index) => {
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
                    .setFooter({ text: `Step 3/5: Currently ${this.setupData.categories.length} categories added` });

                await this.interaction.editReply({
                    embeds: [updatedEmbed],
                    components: [this.createDoneAddingButton()]
                });
            } catch (error) {
                this.client.logger.error(`[SETUP] Error creating category: ${error}`);
                const errorMessage = await channel.send({
                    embeds: [new EmbedTemplate(this.client).error("Error creating category. Please try again with correct format.")]
                });

                // Delete user message
                await message.delete().catch(() => { });

                // Delete error message after 5 seconds
                setTimeout(() => {
                    errorMessage.delete().catch(() => { });
                }, 5000);
            }
        });

        // Stop the category collector when the done button is pressed
        this.collector.on("collect", (btnInteraction) => {
            if (btnInteraction.customId === "done_adding" || btnInteraction.customId === "cancel") {
                categoryMessageCollector.stop();
            }
        });
    }

    /**
     * Finalize category creation
     */
    private async finalizeCategoryCreation(i: discord.MessageComponentInteraction): Promise<void> {
        // Configure select menu if using categories
        await this.ticketRepo.configureSelectMenu(this.interaction.guildId!, {
            placeholder: "Select a ticket category",
            minValues: 1,
            maxValues: 1,
            embedTitle: "Create a Ticket",
            embedDescription: "Please select a category for your ticket"
        });

        // Move to message customization step
        this.setupData.step = 4;
        await this.handleMessageCustomizationPrompt(i);
    }

    /**
     * Handle message customization prompt
     */
    private async handleMessageCustomizationPrompt(i: discord.MessageComponentInteraction): Promise<void> {
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
            components: [this.createYesNoButtons("yes", "no", "cancel")]
        });
    }

    /**
     * Handle message customization
     */
    private async handleMessageCustomization(i: discord.MessageComponentInteraction): Promise<void> {
        if (i.customId === "yes") {
            this.setupData.customizeMessages = true;
            await this.handleMessageCustomizationLater(i);
        } else if (i.customId === "no") {
            this.setupData.customizeMessages = false;

            // Move to deployment step
            this.setupData.step = 5;
            await this.handleDeploymentPrompt(i);
        }
    }

    /**
     * Handle message customization later
     */
    private async handleMessageCustomizationLater(i: discord.MessageComponentInteraction): Promise<void> {
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
            components: [this.createNavigationButtons("prev_msg", "next_deploy", "cancel", true, false)]
        });

        try {
            // Wait for button interaction with proper error handling
            const nextBtn = await (i.message as discord.Message).awaitMessageComponent({
                filter: (component) => component.user.id === this.interaction.user.id,
                time: 60000
            });

            // Always defer the button update immediately to prevent interaction expiration
            await nextBtn.deferUpdate().catch(err => {
                this.client.logger.warn(`[SETUP] Failed to defer next button update: ${err}`);
            });

            if (nextBtn.customId === "next_deploy") {
                this.setupData.step = 5;
                await this.handleDeploymentPrompt(nextBtn);
            } else if (nextBtn.customId === "cancel") {
                await nextBtn.editReply({
                    embeds: [new EmbedTemplate(this.client).info("Setup canceled.")],
                    components: []
                }).catch(err => {
                    this.client.logger.warn(`[SETUP] Error responding to cancel: ${err}`);
                });
                this.collector.stop();
            }
        } catch (error) {
            // Handle timeout from awaitMessageComponent
            this.client.logger.warn(`[SETUP] Button interaction timed out or failed: ${error}`);
            await i.editReply({
                embeds: [new EmbedTemplate(this.client).error("Operation timed out. Please try again.")],
                components: []
            }).catch(() => { /* Ignore any failures here */ });
        }
    }

    /**
     * Handle deployment prompt
     */
    private async handleDeploymentPrompt(i: discord.MessageComponentInteraction): Promise<void> {
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
            components: [this.createDeployButtons()]
        });
    }

    /**
     * Handle deployment
     */
    private async handleDeployment(i: discord.MessageComponentInteraction): Promise<void> {
        if (i.customId === "deploy") {
            await this.deployTicketSystem(i);
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
            await this.interaction.followUp({
                embeds: [
                    new EmbedTemplate(this.client).success("✅ Ticket System Setup Complete!")
                        .setDescription(
                            "Your ticket system has been configured successfully.\n\n" +
                            "You can manage it with the following commands:\n" +
                            "- `/ticket deploy` - Deploy the ticket panel\n" +
                            "- `/ticket config` - Configure ticket settings\n" +
                            "- `/stop` - Disable the ticket system"
                        )
                ]
            });

            this.collector.stop();
        }
    }

    /**
     * Deploy the ticket system
     */
    private async deployTicketSystem(i: discord.MessageComponentInteraction): Promise<void> {
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
            const buttonConfig = await this.ticketRepo.getTicketButtonConfig(this.interaction.guildId!);

            if (!buttonConfig) {
                await i.editReply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("❌ Deployment Failed")
                            .setDescription("Button configuration not found. Please try setup again.")
                            .setColor("Red")
                    ]
                });
                return;
            }

            // Create the ticket panel
            const ticketButtonChannel = this.client.channels.cache.get(this.ticketChannel.id) as discord.TextChannel;

            if (!ticketButtonChannel) {
                await i.editReply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("❌ Deployment Failed")
                            .setDescription("Ticket channel not found. Has it been deleted?")
                            .setColor("Red")
                    ]
                });
                return;
            }

            // Create the embed
            const ticketEmbed = new discord.EmbedBuilder()
                .setTitle(buttonConfig.embedTitle || "Need Help?")
                .setDescription(buttonConfig.embedDescription || "Click the button below to create a ticket")
                .setColor((buttonConfig.embedColor || "#5865F2") as discord.ColorResolvable)
                .setFooter({ text: "Powered by Salt Bot", iconURL: this.client.user?.displayAvatarURL() })
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
            await this.ticketRepo.configureTicketButton(this.interaction.guildId!, {
                messageId: panelMessage.id
            });

            // If using categories, update select menu config
            if (this.setupData.useCategories) {
                await this.ticketRepo.configureSelectMenu(this.interaction.guildId!, {
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
            await this.interaction.followUp({
                embeds: [
                    new EmbedTemplate(this.client).success("✅ Ticket System Setup Complete!")
                        .setDescription(
                            "Your ticket system has been configured and deployed successfully.\n\n" +
                            "You can manage it with the following commands:\n" +
                            "- `/ticket config` - Configure ticket settings\n" +
                            "- `/stop` - Disable the ticket system or remove the panel"
                        )
                ]
            });

            this.collector.stop("completed");
        } catch (error) {
            this.client.logger.error(`[SETUP] Error deploying ticket system: ${error}`);
            await i.editReply({
                embeds: [new EmbedTemplate(this.client).error("An error occurred while deploying the ticket system.")],
                components: []
            });
        }
    }
}

/**
 * The setup slash command for configuring the ticket system
 */
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
            const transcriptChannel = interaction.options.getChannel("transcript_channel") as discord.TextChannel | null || null;

            // Convert APIRole to discord.Role if needed
            let supporterRole: discord.Role | null = null;
            if (supportersRole) {
                // Get the actual Role object from the cache if available
                const guild = interaction.guild;
                if (guild) {
                    try {
                        supporterRole = await guild.roles.fetch(supportersRole.id) || null;
                    } catch (err) {
                        client.logger.warn(`[SETUP] Failed to fetch role: ${err}`);
                    }
                }
            }

            // Create a new setup manager and start the setup process
            const setupManager = new SetupManager(
                interaction,
                client,
                ticketRepo,
                ticketChannel as discord.TextChannel,
                supporterRole,
                transcriptChannel
            );

            await setupManager.start();
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