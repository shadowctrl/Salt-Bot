import discord from "discord.js";

import { Ticket } from "../../../core/ticket";
import { EmbedTemplate } from "../../../core/embed/template";
import { ColorValidator } from "../../../utils/extras";


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
            const validatedColor = ColorValidator.isValidColor(color);
            if (!validatedColor) {
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).error("Invalid color format.")
                            .setDescription("Please provide either:\n• A valid hex color code (e.g., #FF5733, #F73)\n• A Discord color name (e.g., Red, Blue, Green, Purple, Orange, Yellow)")
                    ]
                });
                return;
            }
            updateData.embedColor = validatedColor;
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
                        { name: "Style", value: updatedConfig?.style || "PRIMARY", inline: true },
                        { name: "Title", value: updatedConfig?.embedTitle || "None set", inline: true },
                        { name: "Description", value: updatedConfig?.embedDescription || "None set", inline: true },
                        { name: "Color", value: updatedConfig?.embedColor || "Default", inline: true }
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
        const action = interaction.options.getString("action", true);

        switch (action) {
            case "create": {
                const name = interaction.options.getString("name");
                const description = interaction.options.getString("description");
                const emoji = interaction.options.getString("emoji");
                const supportRole = interaction.options.getRole("support_role");
                const parentCategory = interaction.options.getChannel("parent_category");

                if (!name) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Please provide a name for the ticket category.")]
                    });
                    return;
                }

                const existingCategories = await ticketRepo.getTicketCategories(interaction.guildId!);
                const duplicateName = existingCategories.find((cat: any) =>
                    cat.name.toLowerCase() === name.toLowerCase()
                );

                if (duplicateName) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error(`A category with the name "${name}" already exists.`)]
                    });
                    return;
                }

                try {
                    const categoryData = {
                        name: name,
                        description: description || `Support tickets for ${name}`,
                        emoji: emoji || "🎫",
                        supportRoleId: supportRole?.id,
                        position: existingCategories.length,
                        categoryId: parentCategory?.id
                    };

                    const newCategory = await ticketRepo.createTicketCategory(
                        interaction.guildId!,
                        categoryData
                    );

                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).success("Ticket category created successfully!")
                                .setDescription(`Created new category: **${newCategory.name}**`)
                                .addFields(
                                    { name: "Name", value: newCategory.name, inline: true },
                                    { name: "Description", value: newCategory.description || "No description", inline: true },
                                    { name: "Emoji", value: newCategory.emoji || "🎫", inline: true },
                                    { name: "Support Role", value: supportRole ? `<@&${supportRole.id}>` : "None", inline: true },
                                    { name: "Category ID", value: newCategory.id, inline: true }
                                )
                        ]
                    });

                    client.logger.info(`[TICKET_CONFIG] Created category "${name}" in guild ${interaction.guildId}`);
                } catch (error) {
                    client.logger.error(`[TICKET_CONFIG] Error creating category: ${error}`);
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Failed to create ticket category. Please try again.")]
                    });
                }
                break;
            }

            case "edit": {
                const categoryId = interaction.options.getString("category_id");
                const name = interaction.options.getString("name");
                const description = interaction.options.getString("description");
                const emoji = interaction.options.getString("emoji");
                const supportRole = interaction.options.getRole("support_role");

                if (!categoryId) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Please provide the category ID to edit.")]
                    });
                    return;
                }

                const category = await ticketRepo.getTicketCategory(categoryId);
                if (!category) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Category not found with the provided ID.")]
                    });
                    return;
                }

                const updateData: any = {};
                if (name) updateData.name = name;
                if (description) updateData.description = description;
                if (emoji) updateData.emoji = emoji;
                if (supportRole) updateData.supportRoleId = supportRole.id;

                if (Object.keys(updateData).length === 0) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Please provide at least one field to update.")]
                    });
                    return;
                }

                try {
                    const updatedCategory = await ticketRepo.updateTicketCategory(categoryId, updateData);

                    if (!updatedCategory) {
                        await interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("Failed to update the category.")]
                        });
                        return;
                    }

                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).success("Category updated successfully!")
                                .addFields(
                                    { name: "Name", value: updatedCategory.name, inline: true },
                                    { name: "Description", value: updatedCategory.description || "No description", inline: true },
                                    { name: "Emoji", value: updatedCategory.emoji || "🎫", inline: true },
                                    { name: "Support Role", value: updatedCategory.supportRoleId ? `<@&${updatedCategory.supportRoleId}>` : "None", inline: true }
                                )
                        ]
                    });

                    client.logger.info(`[TICKET_CONFIG] Updated category ${categoryId} in guild ${interaction.guildId}`);
                } catch (error) {
                    client.logger.error(`[TICKET_CONFIG] Error updating category: ${error}`);
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Failed to update ticket category.")]
                    });
                }
                break;
            }

            case "delete": {
                const categoryId = interaction.options.getString("category_id");

                if (!categoryId) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Please provide the category ID to delete.")]
                    });
                    return;
                }

                const category = await ticketRepo.getTicketCategory(categoryId);
                if (!category) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Category not found with the provided ID.")]
                    });
                    return;
                }

                const categoryTickets = await ticketRepo.getCategoryTickets(categoryId);
                const activeTickets = categoryTickets.filter((ticket: any) => ticket.status === "open");

                if (activeTickets.length > 0) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).warning("Cannot delete category with active tickets.")
                                .setDescription(`This category has ${activeTickets.length} active ticket(s). Please close or move them before deleting the category.`)
                        ]
                    });
                    return;
                }

                try {
                    const deleted = await ticketRepo.deleteTicketCategory(categoryId);

                    if (!deleted) {
                        await interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("Failed to delete the category.")]
                        });
                        return;
                    }

                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).success("Category deleted successfully!")
                                .setDescription(`Deleted category: **${category.name}**`)
                        ]
                    });

                    client.logger.info(`[TICKET_CONFIG] Deleted category ${categoryId} (${category.name}) in guild ${interaction.guildId}`);
                } catch (error) {
                    client.logger.error(`[TICKET_CONFIG] Error deleting category: ${error}`);
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Failed to delete ticket category.")]
                    });
                }
                break;
            }

            case "list": {
                const categories = await ticketRepo.getTicketCategories(interaction.guildId!);

                if (!categories || categories.length === 0) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("No ticket categories found.")]
                    });
                    return;
                }

                const categoryList = categories.map((cat: any) => {
                    const statusIcon = cat.isEnabled ? "🟢" : "🔴";
                    const supportRole = cat.supportRoleId ? `<@&${cat.supportRoleId}>` : "None";
                    return `${statusIcon} ${cat.emoji || "🎫"} **${cat.name}**\n` +
                        `   └ *${cat.description || "No description"}*\n` +
                        `   └ Support Role: ${supportRole}\n` +
                        `   └ ID: \`${cat.id}\`\n` +
                        `   └ Tickets: ${cat.ticketCount || 0}`;
                }).join("\n\n");

                const embed = new discord.EmbedBuilder()
                    .setTitle("🔧 Ticket Category Configuration")
                    .setDescription("Current ticket categories:")
                    .addFields({
                        name: `Categories (${categories.length})`,
                        value: categoryList.length > 1024 ? categoryList.substring(0, 1021) + "..." : categoryList
                    })
                    .setColor("Blue")
                    .setFooter({ text: "Use /ticket config category action:edit/delete with category_id to modify" });

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            default: {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Invalid action. Please use create, edit, delete, or list.")]
                });
                break;
            }
        }
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
        const categoryId = interaction.options.getString("category_id", true);
        const welcomeMessage = interaction.options.getString("welcome_message");
        const closeMessage = interaction.options.getString("close_message");
        const includeSupportTeam = interaction.options.getBoolean("include_support_team");

        const category = await ticketRepo.getTicketCategory(categoryId);
        if (!category) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Category not found with the provided ID.")]
            });
            return;
        }

        const messageConfig = await ticketRepo.getTicketMessage(categoryId);

        if (!welcomeMessage && !closeMessage && includeSupportTeam === null) {
            const embed = new discord.EmbedBuilder()
                .setTitle("🔧 Ticket Message Configuration")
                .setDescription(`Current message settings for category: **${category.name}**`)
                .addFields(
                    { name: "Welcome Message", value: messageConfig?.welcomeMessage || "Default welcome message", inline: false },
                    { name: "Close Message", value: messageConfig?.closeMessage || "Default close message", inline: false },
                    { name: "Include Support Team", value: messageConfig?.includeSupportTeam ? "Yes" : "No", inline: true }
                )
                .setColor("Blue")
                .setFooter({ text: "Use the options to update these settings" });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const updateData: Record<string, any> = {};
        if (welcomeMessage !== null) updateData.welcomeMessage = welcomeMessage;
        if (closeMessage !== null) updateData.closeMessage = closeMessage;
        if (includeSupportTeam !== null) updateData.includeSupportTeam = includeSupportTeam;

        await ticketRepo.configureTicketMessages(categoryId, updateData);

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket message configuration updated successfully!")
                    .setDescription(`The message settings for **${category.name}** have been updated.`)
                    .addFields(
                        { name: "Category", value: category.name, inline: true },
                        { name: "Include Support Team", value: updateData.includeSupportTeam !== undefined ? (updateData.includeSupportTeam ? "Yes" : "No") : "Unchanged", inline: true }
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