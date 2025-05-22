import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

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

        const ticketRepo = new TicketRepository((client as any).dataSource);
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
    ticketRepo: TicketRepository
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
    ticketRepo: TicketRepository
): Promise<void> => {
    try {
        const action = interaction.options.getString("action", true);

        switch (action) {
            case "list": {
                const categories = await ticketRepo.getTicketCategories(interaction.guildId!);

                if (categories.length === 0) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).info("No ticket categories found.")
                                .setDescription("Use `/ticket config category action:create` to create a new category.")
                        ]
                    });
                    return;
                }

                const embed = new discord.EmbedBuilder()
                    .setTitle("📋 Ticket Categories")
                    .setDescription(`Found ${categories.length} ticket categories:`)
                    .setColor("Blue");

                categories.forEach((category, index) => {
                    embed.addFields({
                        name: `${index + 1}. ${category.emoji || "🎫"} ${category.name} ${category.isEnabled ? "✅" : "❌"}`,
                        value: `ID: \`${category.id}\`\nDescription: ${category.description || "None"}\nSupport Role: ${category.supportRoleId ? `<@&${category.supportRoleId}>` : "None"}\nPosition: ${category.position}`,
                        inline: false
                    });
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            case "create": {
                const name = interaction.options.getString("name");
                const description = interaction.options.getString("description");
                const emoji = interaction.options.getString("emoji");
                const supportRole = interaction.options.getRole("support_role");
                const parentCategory = interaction.options.getChannel("parent_category");

                if (!name) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).error("Missing required fields.")
                                .setDescription("Category name is required to create a new category.")
                        ]
                    });
                    return;
                }

                const categoryData: {
                    name: string;
                    description?: string;
                    emoji?: string;
                    supportRoleId?: string;
                    position?: number;
                    categoryId?: string;
                } = {
                    name: name,
                    position: 0 
                };

                if (description) categoryData.description = description;
                if (emoji) categoryData.emoji = emoji;
                if (supportRole) categoryData.supportRoleId = supportRole.id;
                if (parentCategory) categoryData.categoryId = parentCategory.id;

                const newCategory = await ticketRepo.createTicketCategory(interaction.guildId!, categoryData);
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).success("Ticket category created successfully!")
                            .setDescription(`New category: ${emoji || "🎫"} **${name}**\n\nID: \`${newCategory.id}\``)
                            .addFields(
                                { name: "Description", value: description || "None set", inline: true },
                                { name: "Support Role", value: supportRole ? `<@&${supportRole.id}>` : "None set", inline: true },
                                { name: "Parent Category", value: parentCategory ? `${parentCategory.name}` : "Auto-created", inline: true }
                            )
                    ]
                });
                return;
            }

            case "edit": {
                const categoryId = interaction.options.getString("category_id");
                if (!categoryId) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).error("Missing category ID.")
                                .setDescription("Please provide the ID of the category you want to edit. You can get IDs with `/ticket config category action:list`.")
                        ]
                    });
                    return;
                }

                const category = await ticketRepo.getTicketCategory(categoryId);
                if (!category) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Ticket category not found.")]
                    });
                    return;
                }

                const name = interaction.options.getString("name");
                const description = interaction.options.getString("description");
                const emoji = interaction.options.getString("emoji");
                const supportRole = interaction.options.getRole("support_role");

                if (!name && !description && !emoji && !supportRole) {
                    await interaction.editReply({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("🔧 Ticket Category Configuration")
                                .setDescription(`Current settings for category: ${category.emoji || "🎫"} **${category.name}**`)
                                .addFields(
                                    { name: "ID", value: category.id, inline: false },
                                    { name: "Description", value: category.description || "None set", inline: true },
                                    { name: "Emoji", value: category.emoji || "🎫", inline: true },
                                    { name: "Support Role", value: category.supportRoleId ? `<@&${category.supportRoleId}>` : "None set", inline: true },
                                    { name: "Enabled", value: category.isEnabled ? "Yes" : "No", inline: true },
                                    { name: "Position", value: category.position.toString(), inline: true }
                                )
                                .setColor("Blue")
                                .setFooter({ text: "Use the options to update these settings" })
                        ]
                    });
                    return;
                }

                const updateData: Record<string, any> = {};
                if (name) updateData.name = name;
                if (description) updateData.description = description;
                if (emoji) updateData.emoji = emoji;
                if (supportRole) updateData.supportRoleId = supportRole.id;

                await ticketRepo.updateTicketCategory(categoryId, updateData);
                const updatedCategory = await ticketRepo.getTicketCategory(categoryId);

                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).success("Ticket category updated successfully!")
                            .setDescription(`Updated category: ${updatedCategory?.emoji || "🎫"} **${updatedCategory?.name}**`)
                            .addFields(
                                { name: "Description", value: updatedCategory?.description || "None set", inline: true },
                                { name: "Support Role", value: updatedCategory?.supportRoleId ? `<@&${updatedCategory.supportRoleId}>` : "None set", inline: true }
                            )
                    ]
                });
                return;
            }

            case "delete": {
                const categoryId = interaction.options.getString("category_id");
                if (!categoryId) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).error("Missing category ID.")
                                .setDescription("Please provide the ID of the category you want to delete. You can get IDs with `/ticket config category action:list`.")
                        ]
                    });
                    return;
                }

                const category = await ticketRepo.getTicketCategory(categoryId);
                if (!category) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Ticket category not found.")]
                    });
                    return;
                }

                const confirmEmbed = new discord.EmbedBuilder()
                    .setTitle("⚠️ Delete Ticket Category")
                    .setDescription(`Are you sure you want to delete the category **${category.name}**?\n\nThis will not delete existing tickets, but they will no longer be associated with this category.\n\nType \`confirm\` to proceed or \`cancel\` to abort.`)
                    .setColor("Red");

                await interaction.editReply({ embeds: [confirmEmbed] });

                const filter = (m: discord.Message) => m.author.id === interaction.user.id;
                const channel = interaction.channel as discord.TextChannel;

                try {
                    const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
                    const response = collected.first()?.content.toLowerCase();

                    try {
                        await collected.first()?.delete();
                    } catch (err) {
                        client.logger.debug(`[TICKET_CONFIG] Could not delete confirmation message: ${err}`);
                    }

                    if (response === "confirm") {
                        const deleted = await ticketRepo.deleteTicketCategory(categoryId);

                        if (deleted) {
                            await interaction.editReply({
                                embeds: [new EmbedTemplate(client).success(`Category **${category.name}** deleted successfully!`)]
                            });
                            return;
                        } else {
                            await interaction.editReply({
                                embeds: [new EmbedTemplate(client).error("Failed to delete the category.")]
                            });
                            return;
                        }
                    } else {
                        await interaction.editReply({
                            embeds: [new EmbedTemplate(client).info("Category deletion cancelled.")]
                        });
                        return;
                    }
                } catch (error) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).info("Category deletion timed out.")]
                    });
                    client.logger.debug(`[TICKET_CONFIG] Confirmation timed out: ${error}`);
                    return;
                }
            }

            default:
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Unknown action.")]
                });
                return;
        }
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket category: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring the ticket category.")]
        });
    }
};

const configTicketMessage = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    try {
        const categoryId = interaction.options.getString("category_id", true);
        const category = await ticketRepo.getTicketCategory(categoryId);
        if (!category) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Ticket category not found.")]
            });
            return;
        }

        const welcomeMessage = interaction.options.getString("welcome_message");
        const closeMessage = interaction.options.getString("close_message");
        const includeSupportTeam = interaction.options.getBoolean("include_support_team");

        if (welcomeMessage === null && closeMessage === null && includeSupportTeam === null) {
            const ticketMessage = await ticketRepo.getTicketMessage(categoryId);

            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("🔧 Ticket Message Configuration")
                        .setDescription(`Current message settings for category: ${category.emoji || "🎫"} **${category.name}**`)
                        .addFields(
                            { name: "Include Support Team", value: ticketMessage?.includeSupportTeam ? "Yes" : "No", inline: false }
                        )
                        .addFields({
                            name: "Welcome Message",
                            value: ticketMessage?.welcomeMessage && ticketMessage.welcomeMessage.length > 0 ?
                                (ticketMessage.welcomeMessage.length > 1024 ?
                                    ticketMessage.welcomeMessage.substring(0, 1021) + "..." :
                                    ticketMessage.welcomeMessage) :
                                "Default welcome message",
                            inline: false
                        })
                        .addFields({
                            name: "Close Message",
                            value: ticketMessage?.closeMessage && ticketMessage.closeMessage.length > 0 ?
                                (ticketMessage.closeMessage.length > 1024 ?
                                    ticketMessage.closeMessage.substring(0, 1021) + "..." :
                                    ticketMessage.closeMessage) :
                                "Default close message",
                            inline: false
                        })
                        .setColor("Blue")
                        .setFooter({ text: "Use the options to update these settings" })
                ]
            });
            return;
        }

        const updateData: Record<string, any> = {};
        if (welcomeMessage !== null) updateData.welcomeMessage = welcomeMessage;
        if (closeMessage !== null) updateData.closeMessage = closeMessage;
        if (includeSupportTeam !== null) updateData.includeSupportTeam = includeSupportTeam;

        await ticketRepo.configureTicketMessages(categoryId, updateData);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket messages updated successfully!")
                    .setDescription(`Updated messages for category: ${category.emoji || "🎫"} **${category.name}**`)
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket messages: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring ticket messages.")]
        });
    }
};

const configTicketTranscript = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    try {
        const transcriptChannel = interaction.options.getChannel("channel") as discord.TextChannel;
        const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);
        if (!buttonConfig) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Ticket button configuration not found.")]
            });
            return;
        }

        if (!transcriptChannel) {
            const currentTranscriptChannel = buttonConfig.logChannelId ?
                await interaction.guild?.channels.fetch(buttonConfig.logChannelId).catch(() => null) :
                null;

            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("🔧 Ticket Transcript Configuration")
                        .setDescription("Current transcript settings:")
                        .addFields({
                            name: "Transcript Channel",
                            value: currentTranscriptChannel ? `${currentTranscriptChannel}` : "Not set",
                            inline: false
                        })
                        .setColor("Blue")
                        .setFooter({ text: "Use the channel option to update this setting" })
                ]
            });
            return;
        }

        if (!(transcriptChannel instanceof discord.TextChannel)) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Invalid channel type. Please select a text channel.")]
            });
            return;
        }

        const botMember = await interaction.guild?.members.fetchMe();
        const botPermissions = transcriptChannel.permissionsFor(botMember!);

        if (!botPermissions?.has([
            discord.PermissionFlagsBits.SendMessages,
            discord.PermissionFlagsBits.EmbedLinks,
            discord.PermissionFlagsBits.AttachFiles
        ])) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error("I don't have the required permissions in that channel.")
                        .setDescription("I need the following permissions in the transcript channel:\n• Send Messages\n• Embed Links\n• Attach Files")
                ]
            });
            return;
        }

        await ticketRepo.configureTicketButton(interaction.guildId!, {
            logChannelId: transcriptChannel.id
        });

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket transcript configuration updated successfully!")
                    .setDescription(`Transcript channel set to ${transcriptChannel}.\n\nTicket transcripts will now be sent to this channel when tickets are closed.`)
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_CONFIG] Error configuring ticket transcript: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while configuring ticket transcripts.")]
        });
    }
};