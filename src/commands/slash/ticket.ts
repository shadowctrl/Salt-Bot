import discord from "discord.js";
import { EmbedTemplate, ButtonTemplate } from "../../utils/embed_template";
import { TicketRepository } from "../../events/database/repo/ticket_system";
import { ITicketStatus } from "../../events/database/entities/ticket_system";
import { SlashCommand } from "../../types";

const ticketCommand: SlashCommand = {
    cooldown: 10,
    owner: false,
    data: new discord.SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manage the ticket system")
        .addSubcommand(subcommand =>
            subcommand
                .setName("config")
                .setDescription("Configure ticket system settings")
                .addStringOption(option =>
                    option.setName("component")
                        .setDescription("Component to configure")
                        .setRequired(true)
                        .addChoices(
                            { name: "Button", value: "button" },
                            { name: "Category", value: "category" },
                            { name: "Messages", value: "messages" },
                            { name: "Select Menu", value: "selectmenu" }
                        ))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("deploy")
                .setDescription("Deploy ticket panel to a channel")
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("Channel to deploy ticket panel to")
                        .addChannelTypes(
                            discord.ChannelType.GuildText,
                            discord.ChannelType.GuildAnnouncement
                        )
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("close")
                .setDescription("Close a ticket")
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Reason for closing the ticket")
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("reopen")
                .setDescription("Reopen a closed ticket")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a user to a ticket")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("User to add to the ticket")
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a user from a ticket")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("User to remove from the ticket")
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("info")
                .setDescription("Get information about a ticket")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("stats")
                .setDescription("Get ticket system statistics")
        ),

    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        try {
            // Check if database is connected
            if (!(client as any).dataSource) {
                return interaction.reply({
                    embeds: [new EmbedTemplate(client).error("Database connection is not available.")],
                    ephemeral: true
                });
            }

            // Get the ticket repository
            const ticketRepo = new TicketRepository((client as any).dataSource);

            // Get subcommand
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case "config":
                    await handleConfigSubcommand(interaction, client, ticketRepo);
                    break;
                case "deploy":
                    await handleDeploySubcommand(interaction, client, ticketRepo);
                    break;
                case "close":
                    await handleCloseSubcommand(interaction, client, ticketRepo);
                    break;
                case "reopen":
                    await handleReopenSubcommand(interaction, client, ticketRepo);
                    break;
                case "add":
                    await handleAddUserSubcommand(interaction, client, ticketRepo);
                    break;
                case "remove":
                    await handleRemoveUserSubcommand(interaction, client, ticketRepo);
                    break;
                case "info":
                    await handleInfoSubcommand(interaction, client, ticketRepo);
                    break;
                case "stats":
                    await handleStatsSubcommand(interaction, client, ticketRepo);
                    break;
                default:
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("Invalid subcommand.")],
                        ephemeral: true
                    });
            }
        } catch (error) {
            client.logger.error(`[TICKET] Error in ticket command: ${error}`);

            // Try to respond if possible
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred while executing the command.")],
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while executing the command.")],
                    ephemeral: true
                });
            }
        }
    }
};

/**
 * Handle the config subcommand for ticket system configuration
 */
const handleConfigSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply({ ephemeral: true });

    // Check if user has required permissions
    if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("You need Administrator permission to configure the ticket system.")]
        });
    }

    // Get guild config
    const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);
    if (!guildConfig) {
        return interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error("Ticket system is not set up for this server.")
                    .setDescription("Use `/setup` command to set up the ticket system.")
            ]
        });
    }

    // Get component to configure
    const component = interaction.options.getString("component", true);

    // Create initial embed for component configuration
    const configEmbed = new discord.EmbedBuilder()
        .setTitle(`🔧 Configure Ticket ${component.charAt(0).toUpperCase() + component.slice(1)}`)
        .setColor("Blue")
        .setTimestamp();

    // Create button row for configuration options
    const buttonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>();

    switch (component) {
        case "button":
            configEmbed.setDescription(
                "Configure the ticket creation button.\n\n" +
                "Click an option below to configure:"
            );
            buttonRow.addComponents(
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
            break;
        case "category":
            configEmbed.setDescription(
                "Configure ticket categories.\n\n" +
                "Click an option below to configure:"
            );
            buttonRow.addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_category_list")
                    .setLabel("List Categories")
                    .setStyle(discord.ButtonStyle.Primary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_category_add")
                    .setLabel("Add Category")
                    .setStyle(discord.ButtonStyle.Success),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_category_edit")
                    .setLabel("Edit Category")
                    .setStyle(discord.ButtonStyle.Secondary)
            );
            break;
        case "messages":
            configEmbed.setDescription(
                "Configure ticket welcome and closing messages.\n\n" +
                "Click an option below to configure:"
            );
            buttonRow.addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_message_welcome")
                    .setLabel("Welcome Message")
                    .setStyle(discord.ButtonStyle.Primary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_message_close")
                    .setLabel("Close Message")
                    .setStyle(discord.ButtonStyle.Primary)
            );
            break;
        case "selectmenu":
            configEmbed.setDescription(
                "Configure the ticket category select menu.\n\n" +
                "Click an option below to configure:"
            );
            buttonRow.addComponents(
                new discord.ButtonBuilder()
                    .setCustomId("ticket_menu_title")
                    .setLabel("Change Title")
                    .setStyle(discord.ButtonStyle.Primary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_menu_desc")
                    .setLabel("Change Description")
                    .setStyle(discord.ButtonStyle.Primary),
                new discord.ButtonBuilder()
                    .setCustomId("ticket_menu_placeholder")
                    .setLabel("Change Placeholder")
                    .setStyle(discord.ButtonStyle.Primary)
            );
            break;
        default:
            return interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Invalid component selected.")]
            });
    }

    // Add cancel button
    buttonRow.addComponents(
        new discord.ButtonBuilder()
            .setCustomId("ticket_config_cancel")
            .setLabel("Cancel")
            .setStyle(discord.ButtonStyle.Danger)
    );

    const response = await interaction.editReply({
        embeds: [configEmbed],
        components: [buttonRow]
    });

    // Create collector for buttons
    const collector = (response as discord.Message).createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes timeout
    });

    collector.on("collect", async (i: discord.MessageComponentInteraction) => {
        await i.deferUpdate();

        // Handle cancel button
        if (i.customId === "ticket_config_cancel") {
            await i.editReply({
                embeds: [new EmbedTemplate(client).info("Configuration canceled.")],
                components: []
            });
            collector.stop();
            return;
        }

        // Handle other button interactions based on customId
        // This is a skeleton implementation - you would expand this with actual configuration logic
        await i.editReply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Configuration Option")
                    .setDescription(`You selected: ${i.customId}\n\nThis configuration option will be implemented soon.`)
                    .setColor("Orange")
            ],
            components: []
        });

        collector.stop();
    });

    collector.on("end", async (collected, reason) => {
        if (reason === "time") {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).info("Configuration timed out.")],
                components: []
            });
        }
    });
};

/**
 * Handle the deploy subcommand for deploying the ticket panel
 */
const handleDeploySubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if user has required permissions
    if (!interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("You need Administrator permission to deploy the ticket panel.")]
        });
    }

    // Get guild config
    const guildConfig = await ticketRepo.getGuildConfig(interaction.guildId!);
    if (!guildConfig) {
        return interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error("Ticket system is not set up for this server.")
                    .setDescription("Use `/setup` command to set up the ticket system.")
            ]
        });
    }

    // Get channel to deploy to
    const channel = interaction.options.getChannel("channel", true) as discord.TextChannel;
    if (!channel || !(channel instanceof discord.TextChannel)) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("Invalid channel selected. Please select a text channel.")]
        });
    }

    // Get button config
    const buttonConfig = await ticketRepo.getTicketButtonConfig(interaction.guildId!);
    if (!buttonConfig) {
        return interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error("Button configuration not found.")
                    .setDescription("Use `/setup` command to set up the ticket system properly.")
            ]
        });
    }

    // Create the embed
    const ticketEmbed = new discord.EmbedBuilder()
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

    // Create the button row
    const buttonRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId("create_ticket")
                .setLabel(buttonConfig.label)
                .setEmoji(buttonConfig.emoji)
                .setStyle(style)
        );

    try {
        // Send the panel
        const panelMessage = await channel.send({
            embeds: [ticketEmbed],
            components: [buttonRow]
        });

        // Update the button config with new message ID and channel ID
        await ticketRepo.configureTicketButton(interaction.guildId!, {
            messageId: panelMessage.id,
            channelId: channel.id
        });

        // If using categories, update select menu config
        const categories = await ticketRepo.getTicketCategories(interaction.guildId!);
        if (categories.length > 1) {
            await ticketRepo.configureSelectMenu(interaction.guildId!, {
                messageId: panelMessage.id
            });
        }

        // Send success message
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success("Ticket panel deployed successfully!")
                    .setDescription(`The ticket panel has been deployed in ${channel}.`)
            ]
        });
    } catch (error) {
        client.logger.error(`[TICKET_DEPLOY] Error deploying ticket panel: ${error}`);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error("Failed to deploy ticket panel.")
                    .setDescription("Make sure the bot has permission to send messages in the selected channel.")
            ]
        });
    }
};

/**
 * Handle the close subcommand for closing tickets
 */
const handleCloseSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if the command is being used in a ticket channel
    const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
        });
    }

    // Check if the ticket is already closed
    if (ticket.status !== ITicketStatus.OPEN) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This ticket is already closed.")]
        });
    }

    // Get reason for closing the ticket
    const reason = interaction.options.getString("reason") || "No reason provided";

    // Create confirmation buttons
    const confirmRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
        .addComponents(
            new discord.ButtonBuilder()
                .setCustomId("confirm_close")
                .setLabel("Close Ticket")
                .setStyle(discord.ButtonStyle.Danger),
            new discord.ButtonBuilder()
                .setCustomId("cancel_close")
                .setLabel("Cancel")
                .setStyle(discord.ButtonStyle.Secondary)
        );

    // Send confirmation message
    const confirmMessage = await interaction.editReply({
        embeds: [
            new discord.EmbedBuilder()
                .setTitle("Close Ticket")
                .setDescription(`Are you sure you want to close this ticket?\n\nReason: ${reason}`)
                .setColor("Red")
                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
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

        if (i.customId === "cancel_close") {
            await i.editReply({
                embeds: [new EmbedTemplate(client).info("Ticket close canceled.")],
                components: []
            });
            collector.stop();
            return;
        }

        if (i.customId === "confirm_close") {
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

            // Create close message embed
            const closeEmbed = new discord.EmbedBuilder()
                .setTitle("Ticket Closed")
                .setDescription(ticketMessage?.closeMessage || "This ticket has been closed.")
                .addFields(
                    { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Reason", value: reason, inline: true }
                )
                .setColor("Red")
                .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
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

                await i.editReply({
                    embeds: [new EmbedTemplate(client).success("Ticket closed successfully.")],
                    components: [actionRow]
                });
            } catch (error) {
                client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);
                await i.editReply({
                    embeds: [
                        new EmbedTemplate(client).warning("Ticket marked as closed, but could not update channel permissions.")
                            .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                    ],
                    components: []
                });
            }

            collector.stop();
        }
    });

    collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).info("Ticket close timed out.")],
                components: []
            });
        }
    });
};

/**
 * Handle the reopen subcommand for reopening tickets
 */
const handleReopenSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if the command is being used in a ticket channel
    const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
        });
    }

    // Check if the ticket is closed
    if (ticket.status === ITicketStatus.OPEN) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This ticket is already open.")]
        });
    }

    // Update ticket status in database
    await ticketRepo.updateTicketStatus(
        ticket.id,
        ITicketStatus.OPEN
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

        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success("Ticket reopened successfully.")]
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
 * Handle the add user subcommand
 */
const handleAddUserSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if the command is being used in a ticket channel
    const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
        });
    }

    // Get the user to add
    const user = interaction.options.getUser("user", true);
    if (!user) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("Please specify a valid user.")]
        });
    }

    // Get the channel
    const channel = interaction.channel as discord.TextChannel;

    // Check if user is already in the ticket
    const permissions = channel.permissionOverwrites.cache.get(user.id);
    if (permissions && permissions.allow.has(discord.PermissionFlagsBits.ViewChannel)) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error(`${user.tag} is already added to this ticket.`)]
        });
    }

    try {
        // Add user to the ticket by updating permissions
        await channel.permissionOverwrites.create(
            user.id,
            {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }
        );

        // Create notification embed
        const addEmbed = new discord.EmbedBuilder()
            .setTitle("User Added")
            .setDescription(`${user.tag} has been added to the ticket by ${interaction.user.tag}`)
            .setColor("Green")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send notification to the channel
        await channel.send({ embeds: [addEmbed] });

        // Send success message
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success(`${user.tag} has been added to the ticket.`)]
        });
    } catch (error) {
        client.logger.error(`[TICKET_ADD] Error adding user: ${error}`);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error(`Failed to add ${user.tag} to the ticket.`)
                    .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
            ]
        });
    }
};

/**
 * Handle the remove user subcommand
 */
const handleRemoveUserSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if the command is being used in a ticket channel
    const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
        });
    }

    // Get the user to remove
    const user = interaction.options.getUser("user", true);
    if (!user) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("Please specify a valid user.")]
        });
    }

    // Don't allow removing the ticket creator
    if (user.id === ticket.creatorId) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("You cannot remove the ticket creator from the ticket.")]
        });
    }

    // Get the channel
    const channel = interaction.channel as discord.TextChannel;

    try {
        // Remove user from the ticket by updating permissions
        await channel.permissionOverwrites.create(
            user.id,
            { ViewChannel: false, SendMessages: false }
        );

        // Create notification embed
        const removeEmbed = new discord.EmbedBuilder()
            .setTitle("User Removed")
            .setDescription(`${user.tag} has been removed from the ticket by ${interaction.user.tag}`)
            .setColor("Red")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        // Send notification to the channel
        await channel.send({ embeds: [removeEmbed] });

        // Send success message
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success(`${user.tag} has been removed from the ticket.`)]
        });
    } catch (error) {
        client.logger.error(`[TICKET_REMOVE] Error removing user: ${error}`);
        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).error(`Failed to remove ${user.tag} from the ticket.`)
                    .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
            ]
        });
    }
};

/**
 * Handle the info subcommand to display ticket information
 */
const handleInfoSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Check if the command is being used in a ticket channel
    const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
        return interaction.editReply({
            embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
        });
    }

    // Format creation date
    const creationDate = new Date(ticket.createdAt);
    const creationTimestamp = Math.floor(creationDate.getTime() / 1000);

    // Format closing date if the ticket is closed
    let closingInfo = "";
    if (ticket.status !== ITicketStatus.OPEN && ticket.closedAt) {
        const closingDate = new Date(ticket.closedAt);
        const closingTimestamp = Math.floor(closingDate.getTime() / 1000);
        closingInfo = `\n**Closed By:** <@${ticket.closedById || "Unknown"}>\n**Closed At:** <t:${closingTimestamp}:F>\n**Reason:** ${ticket.closeReason || "No reason provided"}`;
    }

    // Create info embed
    const infoEmbed = new discord.EmbedBuilder()
        .setTitle(`Ticket #${ticket.ticketNumber} Information`)
        .setDescription(
            `**Creator:** <@${ticket.creatorId}>\n` +
            `**Status:** ${ticket.status}\n` +
            `**Created At:** <t:${creationTimestamp}:F>` +
            closingInfo
        )
        .setColor("Blue")
        .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
        .setTimestamp();

    // Send the info embed
    await interaction.editReply({
        embeds: [infoEmbed]
    });
}

/**
 * Handle the stats subcommand to display ticket system statistics
 */
const handleStatsSubcommand = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client,
    ticketRepo: TicketRepository
) => {
    await interaction.deferReply();

    // Get ticket statistics
    const stats = await ticketRepo.getGuildTicketStats(interaction.guildId!);

    // Create stats embed
    const statsEmbed = new discord.EmbedBuilder()
        .setTitle("Ticket System Statistics")
        .setDescription(
            `**Total Tickets Created:** ${stats.totalTickets}\n` +
            `**Open Tickets:** ${stats.openTickets}\n` +
            `**Closed Tickets:** ${stats.closedTickets}`
        )
        .setColor("Green")
        .setTimestamp();

    // Send the stats embed
    await interaction.editReply({
        embeds: [statsEmbed]
    });
}

export default ticketCommand;