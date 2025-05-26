import discord from "discord.js";
import { BotEvent } from "../../../types";
import { Ticket } from "../../../utils/ticket";

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
            return;
        }

        try {
            if (!(client as any).dataSource) {
                client.logger.error("[TICKET_INTERACTION] Database connection is not available");
                return;
            }

            const ticketManager = new Ticket((client as any).dataSource, client);

            if (interaction.isButton()) {
                switch (interaction.customId) {
                    case "create_ticket":
                        await handleCreateTicketButton(interaction, client, ticketManager);
                        break;
                    case "ticket_close":
                        await handleCloseButton(interaction, client, ticketManager);
                        break;
                    case "ticket_reopen":
                        await handleReopenButton(interaction, client, ticketManager);
                        break;
                    case "ticket_archive":
                        await handleArchiveButton(interaction, client, ticketManager);
                        break;
                    case "ticket_delete":
                        await handleDeleteButton(interaction, client, ticketManager);
                        break;
                    case "ticket_claim":
                        await handleClaimButton(interaction, client, ticketManager);
                        break;
                }
            } else if (interaction.isStringSelectMenu()) {
                if (interaction.customId === "ticket_category_select") {
                    await handleCategorySelect(interaction, client, ticketManager);
                }
            }
        } catch (error) {
            client.logger.error(`[TICKET_INTERACTION] Error handling interaction: ${error}`);
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

const handleCreateTicketButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    try {
        const ticketRepo = ticketManager.getRepository();
        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);
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

        if (enabledCategories.length === 1) {
            const result = await ticketManager.create({
                guildId: interaction.guildId!,
                userId: interaction.user.id,
                categoryId: enabledCategories[0].id
            });

            if (result.success) {
                await interaction.reply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("✅ Ticket Created Successfully")
                            .setDescription(result.message)
                            .setColor("Green")
                    ],
                    flags: discord.MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("❌ Error Creating Ticket")
                            .setDescription(result.message)
                            .setColor("Red")
                    ],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
            return;
        }

        const selectMenu = new discord.StringSelectMenuBuilder()
            .setCustomId("ticket_category_select")
            .setPlaceholder("Select a ticket category");

        enabledCategories.forEach(category => {
            selectMenu.addOptions({
                label: category.name,
                description: category.description?.substring(0, 100) || `Support for ${category.name}`,
                value: category.id,
                emoji: category.emoji || "🎫"
            });
        });

        const menuConfig = await ticketRepo.getSelectMenuConfig(interaction.guildId!);
        const selectEmbed = new discord.EmbedBuilder()
            .setTitle(menuConfig?.embedTitle || "Create a Ticket")
            .setDescription(menuConfig?.embedDescription || "Please select a category for your ticket")
            .setColor((menuConfig?.embedColor || "Blue") as discord.ColorResolvable)
            .setFooter({ text: "Powered by Salt Bot", iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

        const actionRow = new discord.ActionRowBuilder<discord.StringSelectMenuBuilder>()
            .addComponents(selectMenu);

        await interaction.reply({
            embeds: [selectEmbed],
            components: [actionRow],
            flags: discord.MessageFlags.Ephemeral
        });

    } catch (error) {
        client.logger.error(`[TICKET_CREATE] Error handling create ticket button: ${error}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error Creating Ticket")
                        .setDescription("An error occurred while creating your ticket. Please try again later.")
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        }
    }
};

const handleCategorySelect = async (
    interaction: discord.StringSelectMenuInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    try {
        const categoryId = interaction.values[0];

        const result = await ticketManager.create({
            guildId: interaction.guildId!,
            userId: interaction.user.id,
            categoryId: categoryId
        });

        if (result.success) {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("✅ Ticket Created Successfully")
                        .setDescription(result.message)
                        .setColor("Green")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error Creating Ticket")
                        .setDescription(result.message)
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CREATE] Error creating ticket from category select: ${error}`);
        await interaction.reply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("❌ Error Creating Ticket")
                    .setDescription("An error occurred while creating your ticket. Please try again later.")
                    .setColor("Red")
            ],
            flags: discord.MessageFlags.Ephemeral
        });
    }
};

const handleReopenButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    await interaction.deferReply();

    try {
        const result = await ticketManager.reopen(
            interaction.channelId!,
            interaction.user.id
        );

        if (result.success) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("✅ Ticket Reopened")
                        .setDescription(result.message)
                        .setColor("Green")
                ]
            });
        } else {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(result.message)
                        .setColor("Red")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_REOPEN] Error reopening ticket: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("❌ Error")
                    .setDescription("An error occurred while reopening the ticket.")
                    .setColor("Red")
            ]
        });
    }
};

const handleArchiveButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    await interaction.deferReply();

    try {
        const result = await ticketManager.archive(
            interaction.channelId,
            interaction.user.id,
            "Ticket archived via button"
        );

        if (result.success) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("✅ Ticket Archived")
                        .setDescription(result.message)
                        .setColor("Blue")
                ]
            });
        } else {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(result.message)
                        .setColor("Red")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_ARCHIVE] Error archiving ticket: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("❌ Error")
                    .setDescription("An error occurred while archiving the ticket.")
                    .setColor("Red")
            ]
        });
    }
};

const handleDeleteButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    await interaction.deferReply();

    try {
        const result = await ticketManager.delete(
            interaction.channelId,
            interaction.user.id,
            "Ticket deleted via button"
        );

        if (result.success) {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("✅ Ticket Deleted")
                        .setDescription(result.message)
                        .setColor("Red")
                ]
            });
        } else {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(result.message)
                        .setColor("Red")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_DELETE] Error handling delete button: ${error}`);
        await interaction.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("❌ Error")
                    .setDescription("An error occurred while processing the delete request.")
                    .setColor("Red")
            ]
        });
    }
};

const handleClaimButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    try {
        const result = await ticketManager.claim(
            interaction.channelId,
            interaction.user.id
        );

        if (result.success) {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("✅ Ticket Claimed")
                        .setDescription(result.message)
                        .setColor("Green")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(result.message)
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CLAIM] Error claiming ticket: ${error}`);
        try {
            if (!interaction.replied) {
                await interaction.reply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("❌ Error")
                            .setDescription("An error occurred while claiming the ticket.")
                            .setColor("Red")
                    ],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            client.logger.error(`[TICKET_CLAIM] Failed to send error response: ${responseError}`);
        }
    }
};

const handleCloseButton = async (
    interaction: discord.ButtonInteraction,
    client: discord.Client,
    ticketManager: Ticket
): Promise<void> => {
    try {
        const ticket = await ticketManager.getInfo(interaction.channelId);
        if (!ticket) {
            interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription("This is not a valid ticket channel.")
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral,
            });
            return;
        }

        if (ticket.status !== "open") {
            interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription("This ticket is already closed.")
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral,
            });
            return;
        }

        const modal = new discord.ModalBuilder()
            .setCustomId("ticket_close_modal")
            .setTitle("Close Ticket");

        const reasonInput = new discord.TextInputBuilder()
            .setCustomId("ticket_close_reason")
            .setLabel("Reason for closing the ticket")
            .setPlaceholder("Enter the reason for closing this ticket...")
            .setRequired(false)
            .setStyle(discord.TextInputStyle.Paragraph);

        const actionRow = new discord.ActionRowBuilder<discord.TextInputBuilder>()
            .addComponents(reasonInput);

        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    } catch (error) {
        client.logger.error(`[TICKET_CLOSE] Error showing close modal: ${error}`);

        if (!interaction.replied) {
            try {
                await interaction.reply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("❌ Error")
                            .setDescription("An error occurred while processing your request.")
                            .setColor("Red")
                    ],
                    flags: discord.MessageFlags.Ephemeral
                });
            } catch (replyError) {
                client.logger.error(`[TICKET_CLOSE] Failed to send error response: ${replyError}`);
            }
        }
    }
};

export default event;