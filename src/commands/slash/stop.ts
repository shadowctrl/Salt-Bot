import discord from "discord.js";
import { EmbedTemplate } from "../../utils/embed_template";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../events/database/entities/ticket_system";
import { SlashCommand } from "../../types";

const stopCommand: SlashCommand = {
    cooldown: 10,
    owner: false,
    userPerms: [discord.PermissionFlagsBits.Administrator],
    data: new discord.SlashCommandBuilder()
        .setName("stop")
        .setDescription("Disable or manage the ticket system")
        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription("Disable the ticket system entirely"))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove_panel")
                .setDescription("Remove the ticket panel message"))
        .addSubcommand(subcommand =>
            subcommand
                .setName("close_all")
                .setDescription("Close all open tickets")),

    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        try {
            await interaction.deferReply();

            // Check if database is connected
            if (!(client as any).dataSource) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Database connection is not available.")]
                });
            }

            // Get the ticket repository
            const ticketRepo = new TicketRepository((client as any).dataSource);

            // Get guild config
            const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);

            if (!guildConfig) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Ticket system is not set up for this server.")]
                });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case "disable": {
                    // Ask for confirmation
                    const confirmEmbed = new discord.EmbedBuilder()
                        .setTitle("⚠️ Disable Ticket System")
                        .setDescription(
                            "Are you sure you want to disable the ticket system?\n\n" +
                            "This will prevent new tickets from being created, but won't delete any existing tickets or configurations.\n\n" +
                            "Type `confirm` to disable, or `cancel` to abort."
                        )
                        .setColor("Orange");

                    await interaction.editReply({ embeds: [confirmEmbed] });

                    // Create message collector
                    const channel = interaction.channel as discord.TextChannel;
                    if (!channel) return;

                    try {
                        const collected = await channel.awaitMessages({
                            filter: (m) => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        // Clean up user message
                        try {
                            await collected.first()?.delete();
                        } catch (err) {
                            client.logger.debug(`[STOP] Could not delete message: ${err}`);
                        }

                        const response = collected.first()?.content.trim().toLowerCase();

                        if (response === "confirm") {
                            // Disable the ticket system
                            await ticketRepo.updateGuildConfig(interaction.guildId!, {
                                isEnabled: false
                            });

                            return interaction.editReply({
                                embeds: [
                                    new EmbedTemplate(client).success("Ticket system has been disabled.")
                                        .setDescription(
                                            "The ticket system has been disabled. No new tickets can be created.\n\n" +
                                            "Existing tickets are not affected.\n\n" +
                                            "To re-enable the system, use `/setup` again."
                                        )
                                ]
                            });
                        } else {
                            return interaction.editReply({
                                embeds: [new EmbedTemplate(client).info("Operation canceled.")]
                            });
                        }
                    } catch (error) {
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("Confirmation timed out. Operation canceled.")]
                        });
                    }
                    break;
                }

                case "remove_panel": {
                    // Get button config
                    const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);

                    if (!buttonConfig || !buttonConfig.messageId || !buttonConfig.channelId) {
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("No ticket panel found to remove.")]
                        });
                    }

                    try {
                        // Try to find and delete the panel message
                        const channel = await client.channels.fetch(buttonConfig.channelId) as discord.TextChannel;

                        if (channel) {
                            try {
                                const message = await channel.messages.fetch(buttonConfig.messageId);
                                await message.delete();

                                // Update the database to remove the message ID
                                await ticketRepo.configureTicketButton(interaction.guildId!, {
                                    messageId: undefined
                                });

                                return interaction.editReply({
                                    embeds: [new EmbedTemplate(client).success("Ticket panel has been removed.")]
                                });
                            } catch (error) {
                                client.logger.error(`[STOP] Error fetching/deleting message: ${error}`);

                                // Even if message couldn't be deleted, update the DB
                                await ticketRepo.configureTicketButton(interaction.guildId!, {
                                    messageId: undefined
                                });

                                return interaction.editReply({
                                    embeds: [
                                        new EmbedTemplate(client).warning("Could not find the panel message. It may have been deleted already.")
                                            .setDescription("Database has been updated to reflect panel removal.")
                                    ]
                                });
                            }
                        } else {
                            client.logger.error(`[STOP] Channel not found: ${buttonConfig.channelId}`);

                            // Update the database anyway
                            await ticketRepo.configureTicketButton(interaction.guildId!, {
                                messageId: undefined
                            });

                            return interaction.editReply({
                                embeds: [
                                    new EmbedTemplate(client).warning("Could not find the ticket channel. It may have been deleted.")
                                        .setDescription("Database has been updated to reflect panel removal.")
                                ]
                            });
                        }
                    } catch (error) {
                        client.logger.error(`[STOP] Error removing panel: ${error}`);
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("An error occurred while removing the ticket panel.")]
                        });
                    }
                    break;
                }

                case "close_all": {
                    // Ask for confirmation
                    const confirmEmbed = new discord.EmbedBuilder()
                        .setTitle("⚠️ Close All Tickets")
                        .setDescription(
                            "Are you sure you want to close ALL open tickets?\n\n" +
                            "This action cannot be undone.\n\n" +
                            "Type `confirm` to close all tickets, or `cancel` to abort."
                        )
                        .setColor("Red");

                    await interaction.editReply({ embeds: [confirmEmbed] });

                    // Create message collector
                    const channel = interaction.channel as discord.TextChannel;
                    if (!channel) return;

                    try {
                        const collected = await channel.awaitMessages({
                            filter: (m) => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        // Clean up user message
                        try {
                            await collected.first()?.delete();
                        } catch (err) {
                            client.logger.debug(`[STOP] Could not delete message: ${err}`);
                        }

                        const response = collected.first()?.content.trim().toLowerCase();

                        if (response === "confirm") {
                            const loadingEmbed = new discord.EmbedBuilder()
                                .setTitle("⏳ Processing")
                                .setDescription("Closing all open tickets... This may take a moment.")
                                .setColor("Blue");

                            await interaction.editReply({ embeds: [loadingEmbed] });

                            // Get all open tickets
                            const tickets = await ticketRepo.getGuildTickets(interaction.guildId!);
                            const openTickets = tickets.filter(t => t.status === "open");

                            if (openTickets.length === 0) {
                                return interaction.editReply({
                                    embeds: [new EmbedTemplate(client).info("There are no open tickets to close.")]
                                });
                            }

                            let closedCount = 0;
                            let failedCount = 0;

                            // Close each ticket
                            for (const ticket of openTickets) {
                                try {
                                    // Update ticket status
                                    await ticketRepo.updateTicketStatus(
                                        ticket.id,
                                        ITicketStatus.CLOSED,
                                        interaction.user.id,
                                        "Bulk close by administrator"
                                    );

                                    // Try to send closing message in the ticket channel
                                    try {
                                        const ticketChannel = await client.channels.fetch(ticket.channelId) as discord.TextChannel;

                                        if (ticketChannel) {
                                            const closeEmbed = new discord.EmbedBuilder()
                                                .setTitle("Ticket Closed")
                                                .setDescription("This ticket has been closed by an administrator.")
                                                .setColor("Red")
                                                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
                                                .setTimestamp();

                                            await ticketChannel.send({ embeds: [closeEmbed] });

                                            // Try to update channel permissions
                                            if (ticketChannel.manageable) {
                                                // Lock the channel by denying SendMessages permission
                                                await ticketChannel.permissionOverwrites.create(
                                                    interaction.guild!.roles.everyone,
                                                    { SendMessages: false }
                                                );
                                            }
                                        }
                                    } catch (channelError) {
                                        client.logger.debug(`[STOP] Could not send close message to ticket channel: ${channelError}`);
                                        // Continue anyway - the ticket status has been updated in the database
                                    }

                                    closedCount++;
                                } catch (error) {
                                    client.logger.error(`[STOP] Error closing ticket ${ticket.id}: ${error}`);
                                    failedCount++;
                                }
                            }

                            return interaction.editReply({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setTitle("Tickets Closed")
                                        .setDescription(
                                            `Successfully closed ${closedCount} tickets.\n` +
                                            (failedCount > 0 ? `Failed to close ${failedCount} tickets.` : "")
                                        )
                                        .setColor(failedCount > 0 ? "Orange" : "Green")
                                        .setTimestamp()
                                ]
                            });
                        } else {
                            return interaction.editReply({
                                embeds: [new EmbedTemplate(client).info("Operation canceled.")]
                            });
                        }
                    } catch (error) {
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("Confirmation timed out. Operation canceled.")]
                        });
                    }
                    break;
                }

                default:
                    return interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("Invalid subcommand.")]
                    });
            }
        } catch (error) {
            client.logger.error(`[STOP] Error in stop command: ${error}`);

            // Try to respond if possible
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred while executing the command.")],
                    flags: discord.MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while executing the command.")],
                    flags: discord.MessageFlags.Ephemeral,
                });
            }
        }
    }
};

export default stopCommand;