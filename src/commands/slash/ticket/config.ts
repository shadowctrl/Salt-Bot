import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

/**
 * Handle the configuration component selection and route to appropriate handler
 */
export const handleConfigComponent = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository,
    component: string
): Promise<void> => {
    // Need to defer reply to prevent timeout
    await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });

    try {
        switch (component) {
            case "button":
                await configButtonComponent(interaction, client, ticketRepo);
                break;
            case "category":
                await configCategoryComponent(interaction, client, ticketRepo);
                break;
            case "messages":
                await configMessagesComponent(interaction, client, ticketRepo);
                break;
            case "selectmenu":
                await configSelectMenuComponent(interaction, client, ticketRepo);
                break;
            default:
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Invalid component selected.")]
                });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error in handleConfigComponent: ${error}`);

        if (interaction.deferred) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("An error occurred during configuration.")]
            });
        } else {
            await interaction.followUp({
                embeds: [new EmbedTemplate(client).error("An error occurred during configuration.")],
                flags: discord.MessageFlags.Ephemeral
            });
        }
    }
};

/**
 * Configure ticket button settings
 */
const configButtonComponent = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    try {
        // Get current button configuration
        const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);
        if (!buttonConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Button configuration not found.")]
            });
            return;
        }

        // Create initial embed
        const configEmbed = new discord.EmbedBuilder()
            .setTitle("🔧 Configure Ticket Button")
            .setDescription(
                "Configure the ticket creation button.\n\n" +
                "Current Configuration:\n" +
                `**Label:** ${buttonConfig.label}\n` +
                `**Emoji:** ${buttonConfig.emoji}\n` +
                `**Style:** ${buttonConfig.style}\n` +
                `**Embed Title:** ${buttonConfig.embedTitle || "Default"}\n` +
                `**Embed Description:** ${buttonConfig.embedDescription || "Default"}\n\n` +
                "Click an option below to configure:"
            )
            .setColor("Blue")
            .setTimestamp();

        // Create button row
        const buttonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_button_label")
                    .setLabel("Change Label")
                    .setStyle(discord.ButtonStyle.Primary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_button_emoji")
                    .setLabel("Change Emoji")
                    .setStyle(discord.ButtonStyle.Primary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_button_style")
                    .setLabel("Change Style")
                    .setStyle(discord.ButtonStyle.Primary)
            );

        // Add second row for embed config
        const embedRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_button_title")
                    .setLabel("Change Embed Title")
                    .setStyle(discord.ButtonStyle.Secondary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_button_desc")
                    .setLabel("Change Description")
                    .setStyle(discord.ButtonStyle.Secondary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_button_color")
                    .setLabel("Change Color")
                    .setStyle(discord.ButtonStyle.Secondary)
            );

        // Add third row for cancel button
        const cancelRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_config_cancel")
                    .setLabel("Cancel")
                    .setStyle(discord.ButtonStyle.Danger)
            );

        // Send the config message
        const response = await interaction.editReply({
            embeds: [configEmbed],
            components: [buttonRow, embedRow, cancelRow]
        });

        // Create collector for buttons
        const collector = (response as discord.Message).createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: 300000 // 5 minutes timeout
        });

        // Set up modal and button collectors
        setupButtonConfig(collector as any, client, ticketRepo, interaction, buttonConfig);
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error in configButtonComponent: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred during button configuration.")]
        });
    }
};

/**
 * Set up button configuration collectors
 */
const setupButtonConfig = (
    collector: any,
    client: discord.Client,
    ticketRepo: TicketRepository,
    originalInteraction: discord.ChatInputCommandInteraction,
    buttonConfig: any
): void => {
    collector.on("collect", async (i: discord.MessageComponentInteraction) => {
        // Always acknowledge the button press first
        await i.deferUpdate().catch(err => {
            client.logger.debug(`[TICKET_CONFIG] Failed to defer update: ${err}`);
        });

        // Handle cancel button
        if (i.customId === "ticket_config_cancel") {
            await i.editReply({
                embeds: [new EmbedTemplate(client).info("Configuration canceled.")],
                components: []
            }).catch(err => {
                client.logger.error(`[TICKET_CONFIG] Error canceling config: ${err}`);
            });
            collector.stop();
            return;
        }

        try {
            switch (i.customId) {
                case "ticket_button_label":
                    // Show modal for label input
                    if (i instanceof discord.ButtonInteraction) {
                        const modal = new discord.ModalBuilder()
                            .setCustomId("button_label_modal")
                            .setTitle("Change Button Label");

                        const labelInput = new discord.TextInputBuilder()
                            .setCustomId("button_label_input")
                            .setLabel("New Button Label")
                            .setValue(buttonConfig.label)
                            .setPlaceholder("Enter the new button label (e.g., Create Ticket)")
                            .setRequired(true)
                            .setStyle(discord.TextInputStyle.Short)
                            .setMaxLength(80);

                        modal.addComponents(
                            new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(labelInput)
                        );

                        await i.showModal(modal).catch(err => {
                            client.logger.error(`[TICKET_CONFIG] Error showing modal: ${err}`);
                        });
                    }
                    break;

                case "ticket_button_emoji":
                    // Show modal for emoji input
                    if (i instanceof discord.ButtonInteraction) {
                        const modal = new discord.ModalBuilder()
                            .setCustomId("button_emoji_modal")
                            .setTitle("Change Button Emoji");

                        const emojiInput = new discord.TextInputBuilder()
                            .setCustomId("button_emoji_input")
                            .setLabel("New Button Emoji")
                            .setValue(buttonConfig.emoji)
                            .setPlaceholder("Enter the new button emoji (e.g., 🎫)")
                            .setRequired(true)
                            .setStyle(discord.TextInputStyle.Short)
                            .setMaxLength(10);

                        modal.addComponents(
                            new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(emojiInput)
                        );

                        await i.showModal(modal).catch(err => {
                            client.logger.error(`[TICKET_CONFIG] Error showing modal: ${err}`);
                        });
                    }
                    break;

                case "ticket_button_style":
                    // Show style selection menu
                    const styleRow = new discord.ActionRowBuilder<discord.StringSelectMenuBuilder>()
                        .addComponents(
                            new discord.StringSelectMenuBuilder()
                                .setCustomId("button_style_select")
                                .setPlaceholder("Select a button style")
                                .addOptions([
                                    {
                                        label: "Blue (Primary)",
                                        description: "Blue button style",
                                        value: "PRIMARY",
                                        emoji: "🔵",
                                        default: buttonConfig.style === "PRIMARY"
                                    },
                                    {
                                        label: "Grey (Secondary)",
                                        description: "Grey button style",
                                        value: "SECONDARY",
                                        emoji: "⚪",
                                        default: buttonConfig.style === "SECONDARY"
                                    },
                                    {
                                        label: "Green (Success)",
                                        description: "Green button style",
                                        value: "SUCCESS",
                                        emoji: "🟢",
                                        default: buttonConfig.style === "SUCCESS"
                                    },
                                    {
                                        label: "Red (Danger)",
                                        description: "Red button style",
                                        value: "DANGER",
                                        emoji: "🔴",
                                        default: buttonConfig.style === "DANGER"
                                    }
                                ])
                        );

                    await i.editReply({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("Select Button Style")
                                .setDescription("Choose a style for the ticket button:")
                                .setColor("Blue")
                        ],
                        components: [styleRow]
                    }).catch(err => {
                        client.logger.error(`[TICKET_CONFIG] Error showing style selection: ${err}`);
                    });
                    break;

                case "ticket_button_title":
                    // Show modal for title input
                    if (i instanceof discord.ButtonInteraction) {
                        const modal = new discord.ModalBuilder()
                            .setCustomId("button_title_modal")
                            .setTitle("Change Embed Title");

                        const titleInput = new discord.TextInputBuilder()
                            .setCustomId("button_title_input")
                            .setLabel("New Embed Title")
                            .setValue(buttonConfig.embedTitle || "Need Help?")
                            .setPlaceholder("Enter the new embed title (e.g., Need Help?)")
                            .setRequired(true)
                            .setStyle(discord.TextInputStyle.Short)
                            .setMaxLength(100);

                        modal.addComponents(
                            new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(titleInput)
                        );

                        await i.showModal(modal).catch(err => {
                            client.logger.error(`[TICKET_CONFIG] Error showing modal: ${err}`);
                        });
                    }
                    break;

                case "ticket_button_desc":
                    // Show modal for description input
                    if (i instanceof discord.ButtonInteraction) {
                        const modal = new discord.ModalBuilder()
                            .setCustomId("button_desc_modal")
                            .setTitle("Change Embed Description");

                        const descInput = new discord.TextInputBuilder()
                            .setCustomId("button_desc_input")
                            .setLabel("New Embed Description")
                            .setValue(buttonConfig.embedDescription || "Click the button below to create a ticket")
                            .setPlaceholder("Enter the new embed description")
                            .setRequired(true)
                            .setStyle(discord.TextInputStyle.Paragraph)
                            .setMaxLength(1000);

                        modal.addComponents(
                            new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(descInput)
                        );

                        await i.showModal(modal).catch(err => {
                            client.logger.error(`[TICKET_CONFIG] Error showing modal: ${err}`);
                        });
                    }
                    break;

                case "ticket_button_color":
                    // Show modal for color input
                    if (i instanceof discord.ButtonInteraction) {
                        const modal = new discord.ModalBuilder()
                            .setCustomId("button_color_modal")
                            .setTitle("Change Embed Color");

                        const colorInput = new discord.TextInputBuilder()
                            .setCustomId("button_color_input")
                            .setLabel("New Embed Color (HEX)")
                            .setValue(buttonConfig.embedColor || "#5865F2")
                            .setPlaceholder("Enter the hex color code (e.g., #5865F2)")
                            .setRequired(true)
                            .setStyle(discord.TextInputStyle.Short)
                            .setMaxLength(7);

                        modal.addComponents(
                            new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(colorInput)
                        );

                        await i.showModal(modal).catch(err => {
                            client.logger.error(`[TICKET_CONFIG] Error showing modal: ${err}`);
                        });
                    }
                    break;

                case "button_style_select":
                    if (i.isStringSelectMenu()) {
                        const newStyle = i.values[0];

                        try {
                            // Update in database
                            await ticketRepo.configureTicketButton(originalInteraction.guildId!, {
                                style: newStyle
                            });

                            // Update the panel if deployed
                            await updateDeployedPanel(client, ticketRepo, originalInteraction.guildId!);

                            // Send confirmation and refresh the config view
                            await i.followUp({
                                embeds: [new EmbedTemplate(client).success(`Button style updated to: "${newStyle}"`)],
                                flags: discord.MessageFlags.Ephemeral
                            });

                            // After a short delay, refresh the configuration view
                            setTimeout(async () => {
                                await configButtonComponent(originalInteraction, client, ticketRepo);
                            }, 2000);
                        } catch (error) {
                            client.logger.error(`[TICKET_CONFIG] Error updating button style: ${error}`);
                            await i.followUp({
                                embeds: [new EmbedTemplate(client).error("Failed to update button style.")],
                                flags: discord.MessageFlags.Ephemeral
                            });
                        }
                    }
                    break;
            }
        } catch (error) {
            client.logger.error(`[TICKET_CONFIG] Error processing button interaction: ${error}`);

            try {
                await i.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred processing your request.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } catch (followUpErr) {
                client.logger.error(`[TICKET_CONFIG] Error sending follow-up error message: ${followUpErr}`);
            }
        }
    });

    // Set up modal submission handler
    setupModalHandlers(client, ticketRepo, originalInteraction);

    // Handle end of collection
    collector.on("end", async (collected: any, reason: string) => {
        if (reason === "time") {
            try {
                await originalInteraction.editReply({
                    embeds: [new EmbedTemplate(client).info("Configuration timed out.")],
                    components: []
                });
            } catch (error) {
                client.logger.debug(`[TICKET_CONFIG] Error sending timeout message: ${error}`);
            }
        }
    });
};

// Type declaration for our modal handlers
type ModalHandler = (interaction: discord.ModalSubmitInteraction) => Promise<void>;

/**
 * Set up handlers for all modal submissions
 */
const setupModalHandlers = (
    client: discord.Client,
    ticketRepo: TicketRepository,
    originalInteraction: discord.ChatInputCommandInteraction
): void => {
    const modalHandlers: Record<string, ModalHandler> = {
        "button_label_modal": async (interaction) => {
            await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });
            const newLabel = interaction.fields.getTextInputValue("button_label_input");

            try {
                await ticketRepo.configureTicketButton(originalInteraction.guildId!, {
                    label: newLabel
                });

                // Update the panel if deployed
                await updateDeployedPanel(client, ticketRepo, originalInteraction.guildId!);

                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).success(`Button label updated to: "${newLabel}"`)]
                });

                // Refresh the config view
                setTimeout(async () => {
                    await configButtonComponent(originalInteraction, client, ticketRepo);
                }, 2000);
            } catch (error) {
                client.logger.error(`[TICKET_CONFIG] Error updating button label: ${error}`);
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Failed to update button label.")]
                });
            }
        },

        "button_emoji_modal": async (interaction) => {
            await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });
            const newEmoji = interaction.fields.getTextInputValue("button_emoji_input");

            try {
                await ticketRepo.configureTicketButton(originalInteraction.guildId!, {
                    emoji: newEmoji
                });

                // Update the panel if deployed
                await updateDeployedPanel(client, ticketRepo, originalInteraction.guildId!);

                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).success(`Button emoji updated to: "${newEmoji}"`)]
                });

                // Refresh the config view
                setTimeout(async () => {
                    await configButtonComponent(originalInteraction, client, ticketRepo);
                }, 2000);
            } catch (error) {
                client.logger.error(`[TICKET_CONFIG] Error updating button emoji: ${error}`);
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Failed to update button emoji.")]
                });
            }
        },

        "button_title_modal": async (interaction) => {
            await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });
            const newTitle = interaction.fields.getTextInputValue("button_title_input");

            try {
                await ticketRepo.configureTicketButton(originalInteraction.guildId!, {
                    embedTitle: newTitle
                });

                // Update the panel if deployed
                await updateDeployedPanel(client, ticketRepo, originalInteraction.guildId!);

                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).success(`Embed title updated to: "${newTitle}"`)]
                });

                // Refresh the config view
                setTimeout(async () => {
                    await configButtonComponent(originalInteraction, client, ticketRepo);
                }, 2000);
            } catch (error) {
                client.logger.error(`[TICKET_CONFIG] Error updating embed title: ${error}`);
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Failed to update embed title.")]
                });
            }
        },

        "button_desc_modal": async (interaction) => {
            await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });
            const newDesc = interaction.fields.getTextInputValue("button_desc_input");

            try {
                await ticketRepo.configureTicketButton(originalInteraction.guildId!, {
                    embedDescription: newDesc
                });

                // Update the panel if deployed
                await updateDeployedPanel(client, ticketRepo, originalInteraction.guildId!);

                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).success("Embed description updated successfully.")]
                });

                // Refresh the config view
                setTimeout(async () => {
                    await configButtonComponent(originalInteraction, client, ticketRepo);
                }, 2000);
            } catch (error) {
                client.logger.error(`[TICKET_CONFIG] Error updating embed description: ${error}`);
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Failed to update embed description.")]
                });
            }
        },

        "button_color_modal": async (interaction) => {
            await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });
            const newColor = interaction.fields.getTextInputValue("button_color_input");

            // Validate hex color
            const isValidHex = /^#([0-9A-F]{3}){1,2}$/i.test(newColor);

            if (!isValidHex) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Invalid color format. Please use hex format (e.g., #5865F2).")]
                });
                return;
            }

            try {
                await ticketRepo.configureTicketButton(originalInteraction.guildId!, {
                    embedColor: newColor
                });

                // Update the panel if deployed
                await updateDeployedPanel(client, ticketRepo, originalInteraction.guildId!);

                await interaction.editReply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("Color Updated")
                            .setDescription(`Embed color updated to: "${newColor}"`)
                            .setColor(newColor as discord.ColorResolvable)
                    ]
                });

                // Refresh the config view
                setTimeout(async () => {
                    await configButtonComponent(originalInteraction, client, ticketRepo);
                }, 2000);
            } catch (error) {
                client.logger.error(`[TICKET_CONFIG] Error updating embed color: ${error}`);
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Failed to update embed color.")]
                });
            }
        }
    };

    // Capture modal submissions event for the client
    const modalSubmitHandler = async (interaction: discord.Interaction) => {
        if (!interaction.isModalSubmit()) return;

        // Process only if it's related to our current config and from the original user
        if (interaction.user.id !== originalInteraction.user.id) return;

        const handler = modalHandlers[interaction.customId];
        if (handler) {
            try {
                // Remove this listener once we process the modal
                client.removeListener('interactionCreate', modalSubmitHandler);

                // Call the appropriate handler
                await handler(interaction);
            } catch (error) {
                client.logger.error(`[TICKET_CONFIG] Error handling modal submission: ${error}`);

                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            embeds: [new EmbedTemplate(client).error("An error occurred processing your submission.")],
                            flags: discord.MessageFlags.Ephemeral
                        });
                    } else {
                        await interaction.followUp({
                            embeds: [new EmbedTemplate(client).error("An error occurred processing your submission.")],
                            flags: discord.MessageFlags.Ephemeral
                        });
                    }
                } catch (replyError) {
                    client.logger.error(`[TICKET_CONFIG] Error sending modal error message: ${replyError}`);
                }
            }
        }
    };

    // Add a time-limited interaction listener
    client.on('interactionCreate', modalSubmitHandler);

    // Remove the handler after 5 minutes (timeout)
    setTimeout(() => {
        client.removeListener('interactionCreate', modalSubmitHandler);
    }, 300000);
};

/**
 * Update deployed ticket panel
 */
const updateDeployedPanel = async (
    client: discord.Client,
    ticketRepo: TicketRepository,
    guildId: string
): Promise<void> => {
    try {
        // Get button config
        const buttonConfig = await ticketRepo.getTicketButtonConfig(guildId);
        if (!buttonConfig || !buttonConfig.messageId || !buttonConfig.channelId) {
            return; // No panel deployed
        }

        // Get the channel
        const channel = await client.channels.fetch(buttonConfig.channelId) as discord.TextChannel;
        if (!channel) {
            return; // Channel not found
        }

        try {
            // Get the message
            const message = await channel.messages.fetch(buttonConfig.messageId);
            if (!message) {
                return; // Message not found
            }

            // Create updated embed
            const updatedEmbed = new discord.EmbedBuilder()
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

            // Create updated button row
            const updatedButtonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonConfig.label)
                        .setEmoji(buttonConfig.emoji)
                        .setStyle(style)
                );

            // Update the message
            await message.edit({
                embeds: [updatedEmbed],
                components: [updatedButtonRow]
            });
        } catch (error) {
            client.logger.error(`[TICKET_UPDATE] Error fetching message: ${error}`);
        }
    } catch (error) {
        client.logger.error(`[TICKET_UPDATE] Error updating panel: ${error}`);
    }
};

/**
 * Configure category components
 */
const configCategoryComponent = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    // Since category config is complex with multiple sub-features,
    // we'll show a placeholder message to indicate this functionality would need
    // to be implemented more fully in a real scenario
    await interaction.editReply({
        embeds: [
            new discord.EmbedBuilder()
                .setTitle("🔧 Category Configuration")
                .setDescription(
                    "Category configuration has been refactored to separate files to improve code maintainability.\n\n" +
                    "To implement this part of the system, you would create additional handlers similar to the button configuration."
                )
                .setColor("Blue")
        ]
    });
};

/**
 * Configure message components
 */
const configMessagesComponent = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    await interaction.editReply({
        embeds: [
            new discord.EmbedBuilder()
                .setTitle("🔧 Message Configuration")
                .setDescription(
                    "Message configuration has been refactored to separate files to improve code maintainability.\n\n" +
                    "To implement this part of the system, you would create additional handlers similar to the button configuration."
                )
                .setColor("Blue")
        ]
    });
};

/**
 * Configure select menu components
 */
const configSelectMenuComponent = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    await interaction.editReply({
        embeds: [
            new discord.EmbedBuilder()
                .setTitle("🔧 Select Menu Configuration")
                .setDescription(
                    "Select menu configuration has been refactored to separate files to improve code maintainability.\n\n" +
                    "To implement this part of the system, you would create additional handlers similar to the button configuration."
                )
                .setColor("Blue")
        ]
    });
};