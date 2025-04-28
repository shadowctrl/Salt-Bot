import discord from "discord.js";
import { BotEvent } from "../../../types";
import { createTicket } from "../../../utils/ticket_utils";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { createAndSendTranscript } from "../../../utils/transcript";

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        // Only handle button interactions and select menu interactions
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) {
            return;
        }

        try {
            // Check if dataSource is initialized
            if (!(client as any).dataSource) {
                client.logger.error("[TICKET_INTERACTION] Database connection is not available");
                return;
            }

            const ticketRepo = new TicketRepository((client as any).dataSource);

            if (interaction.isButton()) {
                // Handle ticket button interactions
                switch (interaction.customId) {
                    case "create_ticket":
                        // Get categories
                        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);

                        // Filter for enabled categories only
                        const enabledCategories = categories.filter(category => category.isEnabled);

                        if (enabledCategories.length === 0) {
                            await interaction.reply({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setTitle("No Categories Available")
                                        .setDescription("There are no ticket categories available.")
                                        .setColor("Red")
                                ],
                                flags: discord.MessageFlags.Ephemeral
                            });
                            return;
                        }

                        // If there's only one category, create ticket directly
                        if (enabledCategories.length === 1) {
                            await createTicket(interaction, enabledCategories[0].id);
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
                        await interaction.reply({
                            embeds: [selectEmbed],
                            components: [actionRow],
                            flags: discord.MessageFlags.Ephemeral
                        });
                        break;

                    case "ticket_close":
                        // Check if this is a ticket channel
                        const closeTicket = await ticketRepo.getTicketByChannelId(interaction.channelId);

                        if (!closeTicket) {
                            await interaction.reply({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setTitle("Not a Ticket Channel")
                                        .setDescription("This is not a valid ticket channel.")
                                        .setColor("Red")
                                ],
                                flags: discord.MessageFlags.Ephemeral
                            });
                            return;
                        }

                        // Check if already closed
                        if (closeTicket.status !== "open") {
                            await interaction.reply({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setTitle("Ticket Already Closed")
                                        .setDescription("This ticket is already closed.")
                                        .setColor("Red")
                                ],
                                flags: discord.MessageFlags.Ephemeral
                            });
                            return;
                        }

                        // Create modal for close reason
                        const closeModal = new discord.ModalBuilder()
                            .setCustomId("ticket_close_modal")
                            .setTitle("Close Ticket");

                        // Add reason input
                        const reasonInput = new discord.TextInputBuilder()
                            .setCustomId("ticket_close_reason")
                            .setLabel("Reason for closing the ticket")
                            .setPlaceholder("Enter the reason for closing this ticket...")
                            .setRequired(false)
                            .setStyle(discord.TextInputStyle.Paragraph);

                        const actionRow2 = new discord.ActionRowBuilder<discord.TextInputBuilder>()
                            .addComponents(reasonInput);

                        closeModal.addComponents(actionRow2);

                        // Show the modal
                        await interaction.showModal(closeModal);
                        break;

                    case "ticket_reopen":
                        // Handle reopen button
                        await handleReopenTicket(interaction, client, ticketRepo);
                        break;

                    case "ticket_archive":
                        // Handle archive button
                        await handleArchiveTicket(interaction, client, ticketRepo);
                        break;

                    case "ticket_delete":
                        // Handle delete button
                        await handleDeleteTicket(interaction, client, ticketRepo);
                        break;
                }
            } else if (interaction.isStringSelectMenu()) {
                // Handle ticket category selection
                if (interaction.customId === "ticket_category_select") {
                    const categoryId = interaction.values[0];
                    await createTicket(interaction, categoryId);
                }
            } else if (interaction.isModalSubmit()) {
                // Handle modal submissions
                if (interaction.customId === "ticket_close_modal") {
                    await handleTicketCloseModal(interaction, client, ticketRepo);
                }
            }
        } catch (error) {
            client.logger.error(`[TICKET_INTERACTION] Error handling interaction: ${error}`);

            // Try to reply with error if possible
            try {
                if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        embeds: [
                            new discord.EmbedBuilder()
                                .setTitle("Error")
                                .setDescription("An error occurred while processing your request.")
                                .setColor("Red")
                        ],
                        flags: discord.MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                client.logger.error(`[TICKET_INTERACTION] Error sending error message: ${replyError}`);
            }
        }
    }
};

// Handle ticket reopen button
const handleReopenTicket = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Check if this is a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId!);

        if (!ticket) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Not a Ticket Channel")
                        .setDescription("This is not a valid ticket channel.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Check if already open
        if (ticket.status === "open") {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Ticket Already Open")
                        .setDescription("This ticket is already open.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Update ticket status
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.OPEN
        );

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Create reopen message
        const reopenEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Reopened")
            .setDescription("This ticket has been reopened.")
            .addFields(
                { name: "Reopened By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Reopened At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setColor("Green")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send message to channel
        await channel.send({ embeds: [reopenEmbed] });

        // Update channel permissions
        try {
            // Reset permissions for everyone
            await channel.permissionOverwrites.edit(
                interaction.guild!.roles.everyone,
                { SendMessages: null }
            );

            // Set permissions for original ticket creator
            await channel.permissionOverwrites.edit(
                ticket.creatorId,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

            // If support role exists, set permissions
            if (ticket.category.supportRoleId) {
                await channel.permissionOverwrites.edit(
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

            // Send success message
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Ticket Reopened")
                        .setDescription("The ticket has been reopened successfully.")
                        .setColor("Green")
                ],
                components: [actionRow]
            });
        } catch (error) {
            client.logger.error(`[TICKET_REOPEN] Error updating permissions: ${error}`);

            // Send warning message if permissions update failed
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Partial Success")
                        .setDescription("The ticket was marked as reopened, but channel permissions could not be updated.")
                        .setColor("Yellow")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_REOPEN] Error reopening ticket: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Error")
                    .setDescription("An error occurred while reopening the ticket.")
                    .setColor("Red")
            ]
        });
    }
};

// Handle ticket archive button
const handleArchiveTicket = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Check if this is a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Not a Ticket Channel")
                        .setDescription("This is not a valid ticket channel.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Check if already archived
        if (ticket.status === "archived") {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Ticket Already Archived")
                        .setDescription("This ticket is already archived.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Update ticket status
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.ARCHIVED,
            interaction.user.id,
            "Ticket archived via button"
        );

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Create archive message
        const archiveEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Archived")
            .setDescription("This ticket has been archived and will be stored for reference.")
            .addFields(
                { name: "Archived By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Archived At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setColor("Blue")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send message to channel
        await channel.send({ embeds: [archiveEmbed] });

        // Send success message
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Ticket Archived")
                    .setDescription("The ticket has been archived successfully.")
                    .setColor("Blue")
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_ARCHIVE] Error archiving ticket: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Error")
                    .setDescription("An error occurred while archiving the ticket.")
                    .setColor("Red")
            ]
        });
    }
};

// Handle ticket delete button
const handleDeleteTicket = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Check if this is a ticket channel
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Not a Ticket Channel")
                        .setDescription("This is not a valid ticket channel.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Check if user has permission
        if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.ManageChannels)) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Permission Denied")
                        .setDescription("You need the 'Manage Channels' permission to delete tickets.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Create confirmation
        const confirmEmbed = new discord.EmbedBuilder()
            .setTitle("Confirm Ticket Deletion")
            .setDescription("Are you sure you want to delete this ticket? This action cannot be undone.")
            .setColor("Red");

        const confirmRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("confirm_delete")
                    .setLabel("Delete Ticket")
                    .setStyle(discord.ButtonStyle.Danger),
                new discord.ButtonBuilder()
                    .setCustomId("cancel_delete")
                    .setLabel("Cancel")
                    .setStyle(discord.ButtonStyle.Secondary)
            );

        const confirmMessage = await interaction.editReply({
            embeds: [confirmEmbed],
            components: [confirmRow]
        });

        // Create collector for confirmation
        const collector = (confirmMessage as discord.Message).createMessageComponentCollector({
            filter: (i): i is discord.ButtonInteraction =>
                i.isButton() && i.user.id === interaction.user.id,
            time: 30000, // 30 seconds
            max: 1
        });

        collector.on('collect', async i => {
            // Handle the button click
            if (i.customId === "confirm_delete") {
                await i.deferUpdate();

                // Get channel
                const channel = interaction.channel as discord.TextChannel;

                // Create delete message embed for user notification
                const deleteEmbed = new discord.EmbedBuilder()
                    .setTitle("Ticket Deleted")
                    .setDescription(`Ticket #${ticket.ticketNumber} has been deleted.`)
                    .setColor("Red")
                    .setTimestamp();

                // Update ticket status to closed (we don't actually delete from database)
                await ticketRepo.updateTicketStatus(
                    ticket.id,
                    ITicketStatus.CLOSED,
                    interaction.user.id,
                    "Ticket deleted by staff"
                );

                // Send notification to ticket creator
                try {
                    const creator = await client.users.fetch(ticket.creatorId);
                    await creator.send({ embeds: [deleteEmbed] }).catch(() => {
                        // Ignore if DM fails
                    });
                } catch (error) {
                    client.logger.warn(`[TICKET_DELETE] Could not send DM to ticket creator: ${error}`);
                }

                // Update message before deleting channel
                await i.editReply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("Deleting Ticket")
                            .setDescription("The ticket is being deleted...")
                            .setColor("Red")
                    ],
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
            } else {
                // User cancelled
                await i.update({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("Deletion Cancelled")
                            .setDescription("The ticket deletion was cancelled.")
                            .setColor("Green")
                    ],
                    components: []
                });
            }
        });

        collector.on('end', async collected => {
            if (collected.size === 0) {
                // Timed out
                await interaction.editReply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("Deletion Cancelled")
                            .setDescription("The ticket deletion timed out.")
                            .setColor("Green")
                    ],
                    components: []
                });
            }
        });
    } catch (error) {
        client.logger.error(`[TICKET_DELETE] Error handling delete button: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Error")
                    .setDescription("An error occurred while processing the delete request.")
                    .setColor("Red")
            ]
        });
    }
};

// Handle ticket close modal submission
const handleTicketCloseModal = async (
    interaction: discord.ModalSubmitInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
): Promise<void> => {
    await interaction.deferReply();

    try {
        // Get the ticket
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId!);

        if (!ticket) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Not a Ticket Channel")
                        .setDescription("This is not a valid ticket channel.")
                        .setColor("Red")
                ]
            });
            return;
        }

        // Get the reason from the modal
        const reason = interaction.fields.getTextInputValue("ticket_close_reason") || "No reason provided";

        // Update ticket status
        await ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.CLOSED,
            interaction.user.id,
            reason
        );

        // Get the ticket message configuration
        const ticketMessage = await ticketRepo.getTicketMessage(ticket.category.id);
        const category = ticket.category;

        // Create close message
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

        // Get the channel
        const channel = interaction.channel as discord.TextChannel;

        // Send close message
        await channel.send({ embeds: [closeEmbed] });

        // Update channel permissions
        try {
            // Lock the channel
            await channel.permissionOverwrites.edit(
                interaction.guild!.roles.everyone,
                { SendMessages: false }
            );

            // Create action row with management buttons
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

            // Send success message
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Ticket Closed")
                        .setDescription("The ticket has been closed successfully.")
                        .setColor("Green")
                ],
                components: [actionRow]
            });

            // Generate and send transcript
            try {
                await createAndSendTranscript(
                    channel,
                    interaction.user,
                    reason,
                    ticket.id,
                    ticketRepo.dataSource
                );
            } catch (transcriptError) {
                client.logger.error(`[TICKET_CLOSE] Error creating transcript: ${transcriptError}`);
                // Continue even if transcript fails - just log the error
            }
        } catch (error) {
            client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);

            // Send warning message
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Partial Success")
                        .setDescription("The ticket was marked as closed, but channel permissions could not be updated.")
                        .setColor("Yellow")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CLOSE] Error handling close modal: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Error")
                    .setDescription("An error occurred while closing the ticket.")
                    .setColor("Red")
            ]
        });
    }
};

export default event;