import discord from "discord.js";
import { BotEvent } from "../../../types";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { EmbedTemplate } from "../../../utils/embed_template";
import { createAndSendTranscript } from '../../../utils/transcript';

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        // Only handle button interactions and select menu interactions
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        try {
            // Check if dataSource is initialized
            if (!(client as any).dataSource) {
                client.logger.error("[TICKET_BUTTON] Database connection is not available");
                return;
            }

            const ticketRepo = new TicketRepository((client as any).dataSource);

            // Handle ticket button interactions
            if (interaction.customId === "create_ticket") {
                if (!interaction.isButton()) return;
                await handleCreateTicketButton(interaction, client, ticketRepo);
            }
            // Handle ticket category selection
            else if (interaction.isStringSelectMenu() && interaction.customId === "ticket_category_select") {
                await handleCategorySelect(interaction, client, ticketRepo);
            }
            // Handle ticket management buttons
            else if (interaction.customId === "ticket_close") {
                if (!interaction.isButton()) return;
                await handleCloseButton(interaction, client, ticketRepo);
            }
            else if (interaction.customId === "ticket_reopen") {
                if (!interaction.isButton()) return;
                await handleReopenButton(interaction, client, ticketRepo);
            }
            else if (interaction.customId === "ticket_archive") {
                if (!interaction.isButton()) return;
                await handleArchiveButton(interaction, client, ticketRepo);
            }
            else if (interaction.customId === "ticket_delete") {
                if (!interaction.isButton()) return;
                await handleDeleteButton(interaction, client, ticketRepo);
            }
        } catch (error) {
            client.logger.error(`[TICKET_BUTTON] Error handling interaction: ${error}`);

            // Try to respond to the interaction if it hasn't been acknowledged
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                } catch (replyError) {
                    client.logger.error(`[TICKET_BUTTON] Error sending error response: ${replyError}`);
                }
            }
        }
    }
};


/**
 * Handle the create ticket button click
 */
const handleCreateTicketButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    try {
        // Immediately defer reply to prevent timeout issues
        await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });

        // Get guild config
        const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);
        if (!guildConfig || !guildConfig.isEnabled) {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("The ticket system is currently disabled.")]
            });
        }

        // Check if user already has an open ticket
        const guildTickets = await ticketRepo.getGuildTickets(interaction.guildId!);
        const userTickets = guildTickets.filter(ticket =>
            ticket.creatorId === interaction.user.id &&
            ticket.status === "open"
        );

        if (userTickets.length > 0) {
            // User already has an open ticket
            const existingTicket = userTickets[0];
            const ticketChannel = client.channels.cache.get(existingTicket.channelId) as discord.TextChannel;

            if (ticketChannel) {
                return interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).warning("You already have an open ticket!")
                            .setDescription(`Please use your existing ticket: ${ticketChannel}`)
                    ]
                });
            } else {
                // Channel no longer exists, but ticket record does - clean up
                await ticketRepo.updateTicketStatus(existingTicket.id, ITicketStatus.CLOSED, "system", "Ticket channel was deleted");
            }
        }

        // Get categories
        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);

        // Filter for enabled categories only
        const enabledCategories = categories.filter(category => category.isEnabled);

        if (enabledCategories.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("No ticket categories are available.")]
            });
        }

        // If there's only one category, create ticket directly
        if (enabledCategories.length === 1) {
            await createTicket(interaction, client, ticketRepo, enabledCategories[0].id);
            return;
        }

        // Otherwise, show category selection menu
        const selectMenu = new discord.StringSelectMenuBuilder()
            .setCustomId("ticket_category_select")
            .setPlaceholder("Select a ticket category");

        // Add options for each category
        enabledCategories.forEach(category => {
            selectMenu.addOptions({
                label: category.name,
                description: category.description?.substring(0, 100) || `Support for ${category.name}`,
                value: category.id,
                emoji: category.emoji || "🎫"
            });
        });

        // Get select menu config
        const menuConfig = await ticketRepo.getSelectMenuConfig(interaction.guildId!);

        // Create embed for category selection
        const selectEmbed = new discord.EmbedBuilder()
            .setTitle(menuConfig?.embedTitle || "Create a Ticket")
            .setDescription(menuConfig?.embedDescription || "Please select a category for your ticket")
            .setColor((menuConfig?.embedColor || "Blue") as discord.ColorResolvable)
            .setFooter({ text: "Powered by Salt Bot", iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

        // Create action row with select menu
        const actionRow = new discord.ActionRowBuilder<discord.StringSelectMenuBuilder>()
            .addComponents(selectMenu);

        // Send menu to user
        await interaction.editReply({
            embeds: [selectEmbed],
            components: [actionRow]
        });
    } catch (error) {
        client.logger.error(`[TICKET_BUTTON] Error handling create ticket button: ${error}`);

        try {
            // Check if we can still edit the reply
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")]
                });
            }
            // If we can't edit, try to reply if we haven't already
            else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_BUTTON] Failed to send error response: ${responseError}`);
        }
    }
};

/**
 * Handle the category selection from the dropdown menu
 */
const handleCategorySelect = async (
    interaction: discord.StringSelectMenuInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    try {
        // Immediately defer update to prevent timeout issues
        await interaction.deferUpdate();

        const categoryId = interaction.values[0];
        await createTicket(interaction, client, ticketRepo, categoryId);
    } catch (error) {
        client.logger.error(`[TICKET_BUTTON] Error handling category select: ${error}`);

        // Try to follow up with an error message
        try {
            await interaction.followUp({
                embeds: [new EmbedTemplate(client).error("An error occurred while processing your selection.")],
                flags: discord.MessageFlags.Ephemeral
            });
        } catch (followUpError) {
            client.logger.error(`[TICKET_BUTTON] Failed to send followUp error: ${followUpError}`);
        }
    }
};

/**
 * Create a ticket for the user
 */
const createTicket = async (
    interaction: discord.ButtonInteraction | discord.StringSelectMenuInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository,
    categoryId: string
) => {
    let newTicketChannel: discord.TextChannel | null = null;

    try {
        // Get category
        const category = await ticketRepo.getTicketCategory(categoryId);
        if (!category) {
            try {
                // Safely follow up if the category doesn't exist
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("The selected category no longer exists.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } catch (followUpError) {
                client.logger.error(`[TICKET_CREATE] Failed to send followUp about missing category: ${followUpError}`);
            }
            return;
        }

        // Safely update the interaction
        try {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Creating Ticket")
                        .setDescription("Please wait while we create your ticket...")
                        .setColor("Blue")
                ],
                components: []
            });
        } catch (editError) {
            client.logger.warn(`[TICKET_CREATE] Could not update loading message: ${editError}`);
            // Continue with ticket creation even if we can't update the message
        }

        // Generate channel name (temporary)
        const tempChannelName = `ticket-new`;

        // Create ticket channel
        const guild = interaction.guild!;

        newTicketChannel = await guild.channels.create({
            name: tempChannelName,
            type: discord.ChannelType.GuildText,
            parent: category.categoryId,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [discord.PermissionFlagsBits.ViewChannel]
                },
                {
                    id: client.user!.id,
                    allow: [
                        discord.PermissionFlagsBits.ViewChannel,
                        discord.PermissionFlagsBits.SendMessages,
                        discord.PermissionFlagsBits.ManageChannels,
                        discord.PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        discord.PermissionFlagsBits.ViewChannel,
                        discord.PermissionFlagsBits.SendMessages,
                        discord.PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ]
        });

        // Create ticket in database
        const ticket = await ticketRepo.createTicket(
            interaction.guildId!,
            interaction.user.id,
            newTicketChannel.id,
            categoryId
        );

        // Log success early so we know the ticket was created even if there are UI issues
        client.logger.info(`[TICKET_CREATE] User ${interaction.user.tag} created ticket #${ticket.ticketNumber} in category ${category.name}`);

        // Rename the channel with the actual ticket number
        const channelName = `ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`;
        await newTicketChannel.setName(channelName);

        // If category has a support role, add it to channel permissions
        if (category.supportRoleId) {
            try {
                await newTicketChannel.permissionOverwrites.create(
                    category.supportRoleId,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }
                );
            } catch (permissionError) {
                client.logger.warn(`[TICKET_CREATE] Could not set permissions for support role ${category.supportRoleId}: ${permissionError}`);
                // Continue with ticket creation even if role permissions fail
            }
        }

        // Get ticket welcome message
        const ticketMessage = category.ticketMessage;
        const welcomeMessage = ticketMessage?.welcomeMessage ||
            `Welcome to your ticket in the **${category.name}** category!\n\nPlease describe your issue and wait for a staff member to assist you.`;

        // Format creation time
        const creationTime = new Date();
        const creationTimestamp = Math.floor(creationTime.getTime() / 1000);

        // Create welcome embed
        const welcomeEmbed = new discord.EmbedBuilder()
            .setTitle(`Ticket #${ticket.ticketNumber}`)
            .setDescription(welcomeMessage)
            .addFields(
                { name: "Ticket ID", value: `#${ticket.ticketNumber}`, inline: true },
                { name: "Category", value: `${category.emoji || "🎫"} ${category.name}`, inline: true },
                { name: "Status", value: `🟢 Open`, inline: true },
                { name: "Created By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Created At", value: `<t:${creationTimestamp}:F>`, inline: true }
            )
            .setColor("Green")
            .setFooter({ text: `Use /ticket close to close this ticket | ID: ${ticket.id}` })
            .setTimestamp();

        // Create action row with close button
        const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_close")
                    .setLabel("Close Ticket")
                    .setStyle(discord.ButtonStyle.Danger)
                    .setEmoji("🔒")
            );

        // Send welcome message to ticket channel
        await newTicketChannel.send({
            content: ticketMessage?.includeSupportTeam && category.supportRoleId ?
                `<@${interaction.user.id}> | <@&${category.supportRoleId}>` :
                `<@${interaction.user.id}>`,
            embeds: [welcomeEmbed],
            components: [actionRow]
        });

        // Try multiple ways to notify the user about the new ticket
        let notificationSent = false;

        // First try to edit the reply if possible
        try {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).success("Ticket created successfully!")
                        .setDescription(`Your ticket has been created: ${newTicketChannel}\nTicket Number: #${ticket.ticketNumber}`)
                ],
                components: []
            });
            notificationSent = true;
        } catch (editError) {
            client.logger.warn(`[TICKET_CREATE] Could not edit reply: ${editError}`);
        }

        // If edit failed, try followUp
        if (!notificationSent) {
            try {
                await interaction.followUp({
                    embeds: [
                        new EmbedTemplate(client).success("Ticket created successfully!")
                            .setDescription(`Your ticket has been created: ${newTicketChannel}\nTicket Number: #${ticket.ticketNumber}`)
                    ],
                    flags: discord.MessageFlags.Ephemeral
                });
                notificationSent = true;
            } catch (followUpError) {
                client.logger.warn(`[TICKET_CREATE] Could not send followUp: ${followUpError}`);
            }
        }

        // If all notification attempts failed, log this but the ticket is still created
        if (!notificationSent) {
            client.logger.warn(`[TICKET_CREATE] Could not notify user about new ticket, but ticket #${ticket.ticketNumber} was created successfully`);
        }

    } catch (error) {
        client.logger.error(`[TICKET_CREATE] Error creating ticket: ${error}`);

        // Try to notify the user of the error
        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while creating your ticket.")]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while creating your ticket.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } else {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred while creating your ticket.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_CREATE] Failed to send error response: ${responseError}`);
        }

        // Clean up the ticket channel if it was created before the error
        if (newTicketChannel) {
            try {
                await newTicketChannel.delete();
                client.logger.info(`[TICKET_CREATE] Deleted ticket channel after error`);
            } catch (deleteError) {
                client.logger.error(`[TICKET_CREATE] Failed to delete ticket channel after error: ${deleteError}`);
            }
        }
    }
};

/**
 * Handle the close button click
 */
const handleCloseButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    try {
        // Check if the button is being used in a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
        if (!ticket) {
            return interaction.reply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")],
                flags: discord.MessageFlags.Ephemeral,
            });
        }

        // Check if the ticket is already closed
        if (ticket.status !== "open") {
            return interaction.reply({
                embeds: [new EmbedTemplate(client).error("This ticket is already closed.")],
                flags: discord.MessageFlags.Ephemeral,
            });
        }

        // Create modal for close reason
        const modal = new discord.ModalBuilder()
            .setCustomId("ticket_close_modal")
            .setTitle("Close Ticket");

        // Add reason input
        const reasonInput = new discord.TextInputBuilder()
            .setCustomId("ticket_close_reason")
            .setLabel("Reason for closing the ticket")
            .setPlaceholder("Enter the reason for closing this ticket...")
            .setRequired(false)
            .setStyle(discord.TextInputStyle.Paragraph);

        const actionRow = new discord.ActionRowBuilder<discord.TextInputBuilder>()
            .addComponents(reasonInput);

        modal.addComponents(actionRow);

        // Show the modal - this already responds to the interaction
        await interaction.showModal(modal);

        // We'll handle the modal submission in a separate event handler
    } catch (error) {
        client.logger.error(`[TICKET_CLOSE] Error showing close modal: ${error}`);

        // Try to notify the user of the error
        if (!interaction.replied) {
            try {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } catch (replyError) {
                client.logger.error(`[TICKET_CLOSE] Failed to send error response: ${replyError}`);
            }
        }
    }
};

/**
 * Handle the reopen button click
 */
const handleReopenButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    try {
        await interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
        if (!ticket) {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
        }

        // Check if the ticket is closed
        if (ticket.status === "open") {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This ticket is already open.")]
            });
        }

        // Update ticket status in database
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.OPEN,
        );

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Create reopen message embed
        const reopenEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Reopened")
            .setDescription("This ticket has been reopened.")
            .addFields(
                { name: "Reopened By", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setColor("Green")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send reopen message
        await channel.send({ embeds: [reopenEmbed] });

        // Update channel permissions to allow messages again
        try {
            // Reset permissions for everyone
            await channel.permissionOverwrites.create(
                interaction.guild!.roles.everyone,
                { SendMessages: null }
            );

            // Set permissions for original ticket creator
            await channel.permissionOverwrites.create(
                ticket.creatorId,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

            // If there's a support role for this category, set permissions for it
            if (ticket.category.supportRoleId) {
                await channel.permissionOverwrites.create(
                    ticket.category.supportRoleId,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }
                );
            }

            // Create close button
            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_close")
                        .setLabel("Close Ticket")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            await interaction.editReply({
                embeds: [new EmbedTemplate(client).success("Ticket reopened successfully.")],
                components: [actionRow]
            });
        } catch (error) {
            client.logger.error(`[TICKET_REOPEN] Error updating permissions: ${error}`);
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).warning("Ticket marked as reopened, but could not update channel permissions.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_REOPEN] Error reopening ticket: ${error}`);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while reopening the ticket.")]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while reopening the ticket.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_REOPEN] Failed to send error response: ${responseError}`);
        }
    }
};

/**
 * Handle the archive button click
 */
const handleArchiveButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    try {
        await interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
        if (!ticket) {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
        }

        // Check if the ticket is already archived
        if (ticket.status === "archived") {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This ticket is already archived.")]
            });
        }

        // Update ticket status in database
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.ARCHIVED,
            interaction.user.id,
            "Ticket archived"
        );

        // Create archive message embed
        const archiveEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Archived")
            .setDescription("This ticket has been archived and will be stored for reference.")
            .addFields(
                { name: "Archived By", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send archive message
        const channel = interaction.channel as discord.TextChannel;
        await channel.send({ embeds: [archiveEmbed] });

        // Confirmation message
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success("Ticket archived successfully.")]
        });
    } catch (error) {
        client.logger.error(`[TICKET_ARCHIVE] Error archiving ticket: ${error}`);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while archiving the ticket.")]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while archiving the ticket.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_ARCHIVE] Failed to send error response: ${responseError}`);
        }
    }
};

/**
 * Handle the delete button click
 */
const handleDeleteButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    try {
        // First, immediately defer the reply to avoid timeout issues
        await interaction.deferReply();

        // Check if being used in a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
        if (!ticket) {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This is not a valid ticket channel.")]
            });
        }

        // Check if user has permission to delete tickets
        if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.ManageChannels)) {
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You need Manage Channels permission to delete tickets.")]
            });
        }

        // Create confirmation buttons
        const confirmRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("confirm_delete")
                    .setLabel("Yes, Delete")
                    .setStyle(discord.ButtonStyle.Danger),
                new discord.ButtonBuilder()
                    .setCustomId("cancel_delete")
                    .setLabel("Cancel")
                    .setStyle(discord.ButtonStyle.Secondary)
            );

        // Send confirmation message
        const confirmMessage = await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Delete Ticket")
                    .setDescription("Are you sure you want to delete this ticket? This action cannot be undone.")
                    .setColor("Red")
            ],
            components: [confirmRow]
        });

        // Create collector for confirmation buttons with proper type checking
        const collector = (confirmMessage as discord.Message).createMessageComponentCollector({
            filter: (i): i is discord.ButtonInteraction =>
                i.isButton() &&
                ['confirm_delete', 'cancel_delete'].includes(i.customId) &&
                i.user.id === interaction.user.id,
            time: 30000 // 30 seconds timeout
        });

        collector.on("collect", async (i: discord.ButtonInteraction) => {
            try {
                await i.deferUpdate();

                if (i.customId === "cancel_delete") {
                    await i.editReply({
                        embeds: [new EmbedTemplate(client).info("Ticket deletion canceled.")],
                        components: []
                    });
                    collector.stop();
                    return;
                }

                if (i.customId === "confirm_delete") {
                    // Get channel for deletion
                    const channel = interaction.channel as discord.TextChannel;

                    // Create delete message embed for user notification
                    const deleteEmbed = new discord.EmbedBuilder()
                        .setTitle("Ticket Deleted")
                        .setDescription(`Ticket #${ticket.ticketNumber} has been deleted by ${interaction.user.tag}.`)
                        .setColor("Red")
                        .setTimestamp();

                    // Mark as closed instead of completely deleting from database
                    await ticketRepo.updateTicketStatus(
                        ticket.id,
                        ITicketStatus.CLOSED,
                        interaction.user.id,
                        "Ticket deleted by staff"
                    );

                    // Log successful database update early
                    client.logger.info(`[TICKET_DELETE] Ticket #${ticket.ticketNumber} marked as closed in database`);

                    // Send notification to user that created the ticket
                    try {
                        const creator = await client.users.fetch(ticket.creatorId);
                        await creator.send({ embeds: [deleteEmbed] }).catch((dmError) => {
                            client.logger.debug(`[TICKET_DELETE] Could not DM ticket creator: ${dmError}`);
                            // Ignore if DM fails - this is expected sometimes
                        });
                    } catch (userError) {
                        client.logger.warn(`[TICKET_DELETE] Could not fetch or message ticket creator: ${userError}`);
                        // Continue with deletion even if notification fails
                    }

                    // Update message before deleting channel
                    try {
                        await i.editReply({
                            embeds: [new EmbedTemplate(client).success("Deleting ticket...")],
                            components: []
                        });
                    } catch (editError) {
                        client.logger.warn(`[TICKET_DELETE] Could not update confirmation message: ${editError}`);
                        // Continue with deletion even if message update fails
                    }

                    // Delete the channel after a short delay
                    setTimeout(async () => {
                        try {
                            await channel.delete();
                            client.logger.info(`[TICKET_DELETE] Ticket #${ticket.ticketNumber} channel deleted by ${interaction.user.tag}`);
                        } catch (deleteError) {
                            client.logger.error(`[TICKET_DELETE] Error deleting channel: ${deleteError}`);

                            // Try to notify the user if channel deletion fails
                            try {
                                // Send a DM to the user who tried to delete
                                await interaction.user.send({
                                    embeds: [
                                        new EmbedTemplate(client).error("Failed to delete the ticket channel.")
                                            .setDescription("The ticket was marked as closed in the database, but the channel could not be deleted. Manual cleanup may be required.")
                                    ]
                                });
                            } catch (dmError) {
                                client.logger.error(`[TICKET_DELETE] Failed to notify user about channel deletion failure: ${dmError}`);
                            }
                        }
                    }, 3000);

                    collector.stop();
                }
            } catch (buttonError) {
                client.logger.error(`[TICKET_DELETE] Error handling button interaction: ${buttonError}`);

                try {
                    await i.editReply({
                        embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")],
                        components: []
                    });
                } catch (editError) {
                    client.logger.error(`[TICKET_DELETE] Failed to edit reply with error: ${editError}`);
                }
            }
        });

        collector.on("end", async (collected, reason) => {
            if (reason === "time" && collected.size === 0) {
                try {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).info("Ticket deletion timed out.")],
                        components: []
                    });
                } catch (timeoutError) {
                    client.logger.warn(`[TICKET_DELETE] Failed to edit reply after timeout: ${timeoutError}`);
                }
            }
        });
    } catch (error) {
        client.logger.error(`[TICKET_DELETE] Error in delete ticket handler: ${error}`);

        try {
            // Based on interaction state, choose appropriate response method
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while processing your delete request.")]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while processing your delete request.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_DELETE] Failed to send error response: ${responseError}`);
        }
    }
};