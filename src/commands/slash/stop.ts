import discord from "discord.js";

import { Ticket } from "../../core/ticket";
import { SlashCommand } from "../../types";
import { EmbedTemplate } from "../../core/embed/template";


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

            if (!(client as any).dataSource) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Database connection is not available.")]
                });
            }

            const ticketManager = new Ticket((client as any).dataSource, client);
            const ticketRepo = ticketManager.getRepository();
            const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);

            if (!guildConfig) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Ticket system is not set up for this server.")]
                });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case "disable": {
                    const confirmEmbed = new discord.EmbedBuilder()
                        .setTitle("⚠️ Disable Ticket System")
                        .setDescription(
                            "Are you sure you want to disable the ticket system?\n\n" +
                            "This will prevent new tickets from being created, but won't delete any existing tickets or configurations.\n\n" +
                            "Type `confirm` to disable, or `cancel` to abort."
                        )
                        .setColor("Orange");

                    await interaction.editReply({ embeds: [confirmEmbed] });

                    const channel = interaction.channel as discord.TextChannel;
                    if (!channel) return;

                    try {
                        const collected = await channel.awaitMessages({
                            filter: (m) => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        try {
                            await collected.first()?.delete();
                        } catch (err) {
                            client.logger.debug(`[STOP] Could not delete message: ${err}`);
                        }

                        const response = collected.first()?.content.trim().toLowerCase();

                        if (response === "confirm") {
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
                    const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);

                    if (!buttonConfig || !buttonConfig.messageId || !buttonConfig.channelId) {
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("No ticket panel found to remove.")]
                        });
                    }

                    try {
                        const channel = await client.channels.fetch(buttonConfig.channelId) as discord.TextChannel;

                        if (channel) {
                            try {
                                const message = await channel.messages.fetch(buttonConfig.messageId);
                                await message.delete();

                                await ticketRepo.configureTicketButton(interaction.guildId!, {
                                    messageId: undefined
                                });

                                return interaction.editReply({
                                    embeds: [new EmbedTemplate(client).success("Ticket panel has been removed.")]
                                });
                            } catch (error) {
                                client.logger.error(`[STOP] Error fetching/deleting message: ${error}`);

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
                    const confirmEmbed = new discord.EmbedBuilder()
                        .setTitle("⚠️ Close All Tickets")
                        .setDescription(
                            "Are you sure you want to close ALL open tickets?\n\n" +
                            "This action cannot be undone.\n\n" +
                            "Type `confirm` to close all tickets, or `cancel` to abort."
                        )
                        .setColor("Red");

                    await interaction.editReply({ embeds: [confirmEmbed] });

                    const channel = interaction.channel as discord.TextChannel;
                    if (!channel) return;

                    try {
                        const collected = await channel.awaitMessages({
                            filter: (m) => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

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

                            const tickets = await ticketRepo.getGuildTickets(interaction.guildId!);
                            const openTickets = tickets.filter(t => t.status === "open");

                            if (openTickets.length === 0) {
                                return interaction.editReply({
                                    embeds: [new EmbedTemplate(client).info("There are no open tickets to close.")]
                                });
                            }

                            let closedCount = 0;
                            let failedCount = 0;

                            for (const ticket of openTickets) {
                                try {
                                    const result = await ticketManager.close({
                                        channelId: ticket.channelId,
                                        userId: interaction.user.id,
                                        reason: "Bulk close by administrator",
                                        generateTranscript: false
                                    });

                                    if (result.success) {
                                        closedCount++;
                                    } else {
                                        failedCount++;
                                        client.logger.warn(`[STOP] Failed to close ticket ${ticket.id}: ${result.message}`);
                                    }
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