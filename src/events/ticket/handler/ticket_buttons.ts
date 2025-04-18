import discord from "discord.js";
import { BotEvent } from "../../../types";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { EmbedTemplate } from "../../../utils/embed_template";

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        // Only handle button interactions
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
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("An error occurred while processing your request.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
            } catch (replyError) {
                client.logger.error(`[TICKET_BUTTON] Error sending error response: ${replyError}`);
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
    await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral, });

    try {
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
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while creating your ticket.")]
        });
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
    await interaction.deferUpdate();

    try {
        const categoryId = interaction.values[0];
        await createTicket(interaction, client, ticketRepo, categoryId);
    } catch (error) {
        client.logger.error(`[TICKET_BUTTON] Error handling category select: ${error}`);
        await interaction.followUp({
            embeds: [new EmbedTemplate(client).error("An error occurred while creating your ticket.")],
            flags: discord.MessageFlags.Ephemeral,
        });
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
    try {
        // Get category
        const category = await ticketRepo.getTicketCategory(categoryId);
        if (!category) {
            return interaction.followUp({
                embeds: [new EmbedTemplate(client).error("The selected category no longer exists.")],
                ephemeral: true
            });
        }

        // Update interaction response to show loading
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Creating Ticket")
                    .setDescription("Please wait while we create your ticket...")
                    .setColor("Blue")
            ],
            components: []
        });

        // Generate channel name
        // We'll use a temporary placeholder before we know the ticket number
        const tempChannelName = `ticket-new`;

        // Create ticket channel
        const guild = interaction.guild!;
        const ticketChannel = await guild.channels.create({
            name: tempChannelName,
            type: discord.ChannelType.GuildText,
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

        // Create ticket in database with the channel ID we just created
        const ticket = await ticketRepo.createTicket(
            interaction.guildId!,
            interaction.user.id,
            ticketChannel.id,
            categoryId
        );

        // Rename the channel with the actual ticket number
        const channelName = `ticket-${ticket.ticketNumber.toString().padStart(4, '0')}`;
        await ticketChannel.setName(channelName);

        // If category has a support role, add it to channel permissions
        if (category.supportRoleId) {
            try {
                await ticketChannel.permissionOverwrites.create(
                    category.supportRoleId,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }
                );
            } catch (error) {
                client.logger.warn(`[TICKET_CREATE] Could not set permissions for support role ${category.supportRoleId}: ${error}`);
            }
        }

        // Get ticket welcome message
        const ticketMessage = category.ticketMessage;
        const welcomeMessage = ticketMessage?.welcomeMessage ||
            `Welcome to your ticket in the **${category.name}** category!\n\nPlease describe your issue and wait for a staff member to assist you.`;

        // Format creation time
        const creationTime = new Date();
        const creationTimestamp = Math.floor(creationTime.getTime() / 1000);

        // Create welcome embed with improved details
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
        await ticketChannel.send({
            content: ticketMessage?.includeSupportTeam && category.supportRoleId ?
                `<@${interaction.user.id}> | <@&${category.supportRoleId}>` :
                `<@${interaction.user.id}>`,
            embeds: [welcomeEmbed],
            components: [actionRow]
        });

        // Update user interaction to show success
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket created successfully!")
                    .setDescription(`Your ticket has been created: ${ticketChannel}\nTicket Number: #${ticket.ticketNumber}`)
            ],
            components: []
        });

        // Log ticket creation
        client.logger.info(`[TICKET_CREATE] User ${interaction.user.tag} created ticket #${ticket.ticketNumber} in category ${category.name}`);
    } catch (error) {
        client.logger.error(`[TICKET_CREATE] Error creating ticket: ${error}`);
        await interaction.followUp({
            embeds: [new EmbedTemplate(client).error("An error occurred while creating your ticket.")],
            ephemeral: true
        });
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
    // Don't defer the reply here since we're showing a modal
    // Instead of: await interaction.deferReply();

    // Check if the command is being used in a ticket channel
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

    // Wait for modal submission
    try {
        const modalInteraction = await interaction.awaitModalSubmit({
            filter: i => i.customId === "ticket_close_modal" && i.user.id === interaction.user.id,
            time: 120000 // 2 minutes
        });

        // Get reason from modal
        const reason = modalInteraction.fields.getTextInputValue("ticket_close_reason") || "No reason provided";

        // Defer the update on the modal interaction
        await modalInteraction.deferUpdate();

        // Update ticket status in database
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.CLOSED,
            interaction.user.id,
            reason
        );

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Get the ticket message configuration
        const ticketMessage = await ticketRepo.getTicketMessage(ticket.category.id);

        const category = ticket.category;

        // Create close message embed
        const closeEmbed = new discord.EmbedBuilder()
            .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
            .setDescription(ticketMessage?.closeMessage || "This ticket has been closed.")
            .addFields(
                { name: "Ticket ID", value: `#${ticket.ticketNumber}`, inline: true },
                { name: "Category", value: `${category.emoji || "🎫"} ${category.name}`, inline: true },
                { name: "Status", value: `🔴 Closed`, inline: true },
                { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: "Reason", value: reason, inline: false }
            )
            .setColor("Red")
            .setFooter({ text: `Use /ticket reopen to reopen this ticket | ID: ${ticket.id}` })
            .setTimestamp();

        // Send close message
        await channel.send({ embeds: [closeEmbed] });

        // Update channel permissions to prevent further messages
        try {
            await channel.permissionOverwrites.create(
                interaction.guild!.roles.everyone,
                { SendMessages: false }
            );

            // Create archive/delete buttons
            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_reopen")
                        .setLabel("Reopen")
                        .setStyle(discord.ButtonStyle.Success),
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_archive")
                        .setLabel("Archive")
                        .setStyle(discord.ButtonStyle.Secondary),
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_delete")
                        .setLabel("Delete")
                        .setStyle(discord.ButtonStyle.Danger)
                );

            // Use followUp on the modal interaction, not the original interaction
            await modalInteraction.followUp({
                embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                components: [actionRow]
            });
        } catch (error) {
            client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);
            // Use followUp on the modal interaction
            await modalInteraction.followUp({
                embeds: [
                    new EmbedTemplate(client).warning("Ticket marked as closed, but could not update channel permissions.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CLOSE] Modal submission error: ${error}`);
        // Since the original interaction was used to show the modal,
        // we can't reply to it again if the modal times out.
        // Instead, send a message to the channel.
        const channel = interaction.channel as discord.TextChannel;
        if (channel) {
            await channel.send({
                embeds: [new EmbedTemplate(client).error("The operation timed out. Please try again.")],
            });
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
};

/**
 * Handle the archive button click
 */
const handleArchiveButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
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
};

/**
 * Handle the delete button click
 */
const handleDeleteButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if the command is being used in a ticket channel
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

    // Create collector for confirmation buttons
    const collector = (confirmMessage as discord.Message).createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 30000 // 30 seconds timeout
    });

    collector.on("collect", async (i: discord.MessageComponentInteraction) => {
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
            // Get channel
            const channel = interaction.channel as discord.TextChannel;

            // Create delete message embed for user notification
            const deleteEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Deleted")
                .setDescription(`Ticket #${ticket.ticketNumber} has been deleted by ${interaction.user.tag}.`)
                .setColor("Red")
                .setTimestamp();

            // Delete ticket from database (optional, you might want to keep records)
            // await ticketRepo.deleteTicket(ticket.id);

            // Mark as closed instead of deleting completely from database
            await ticketRepo.updateTicketStatus(
                ticket.id,
                ITicketStatus.CLOSED,
                interaction.user.id,
                "Ticket deleted by staff"
            );

            // Send notification to user that created the ticket
            try {
                const creator = await interaction.client.users.fetch(ticket.creatorId);
                await creator.send({ embeds: [deleteEmbed] }).catch(() => {
                    // Ignore if DM fails
                });
            } catch (error) {
                client.logger.warn(`[TICKET_DELETE] Could not send DM to ticket creator: ${error}`);
            }

            // Update message before deleting channel
            await i.editReply({
                embeds: [new EmbedTemplate(client).success("Deleting ticket...")],
                components: []
            });

            // Delete the channel after a short delay
            setTimeout(async () => {
                try {
                    await channel.delete();
                    client.logger.info(`[TICKET_DELETE] Ticket #${ticket.ticketNumber} deleted by ${interaction.user.tag}`);
                } catch (error) {
                    client.logger.error(`[TICKET_DELETE] Error deleting channel: ${error}`);
                }
            }, 3000);

            collector.stop();
        }
    });

    collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).info("Ticket deletion timed out.")],
                components: []
            });
        }
    });
};

export default event;