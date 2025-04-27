import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { handleConfigComponent } from "./config";
import { ITicketStatus } from "../../../events/database/entities/ticket_system";
import { createAndSendTranscript } from "../../../utils/transcript";

/**
 * TicketCommandManager class to handle all ticket-related operations
 */
export class TicketCommandManager {
    private interaction: discord.ChatInputCommandInteraction;
    private client: discord.Client;
    private ticketRepo: TicketRepository;

    /**
     * Create a new TicketCommandManager instance
     */
    constructor(
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client,
        ticketRepo: TicketRepository
    ) {
        this.interaction = interaction;
        this.client = client;
        this.ticketRepo = ticketRepo;
    }

    /**
     * Execute the appropriate subcommand based on user input
     */
    public execute = async (): Promise<void> => {
        try {
            // Get subcommand
            const subcommand = this.interaction.options.getSubcommand();

            switch (subcommand) {
                case "config":
                    await this.configSubcommand();
                    break;
                case "deploy":
                    await this.deploySubcommand();
                    break;
                case "close":
                    await this.closeSubcommand();
                    break;
                case "reopen":
                    await this.reopenSubcommand();
                    break;
                case "add":
                    await this.addUserSubcommand();
                    break;
                case "remove":
                    await this.removeUserSubcommand();
                    break;
                case "info":
                    await this.infoSubcommand();
                    break;
                case "stats":
                    await this.statsSubcommand();
                    break;
                default:
                    await this.interaction.reply({
                        embeds: [new EmbedTemplate(this.client).error("Invalid subcommand.")],
                        flags: discord.MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            this.client.logger.error(`[TICKET] Error executing subcommand: ${error}`);
            this.handleErrorResponse("An error occurred while executing the command.");
        }
    };

    /**
     * Handle error responses consistently
     */
    private handleErrorResponse = async (message: string): Promise<void> => {
        try {
            if (this.interaction.replied || this.interaction.deferred) {
                await this.interaction.followUp({
                    embeds: [new EmbedTemplate(this.client).error(message)],
                    flags: discord.MessageFlags.Ephemeral
                });
            } else {
                await this.interaction.reply({
                    embeds: [new EmbedTemplate(this.client).error(message)],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            this.client.logger.error(`[TICKET] Error sending error response: ${error}`);
        }
    };

    /**
     * Handle the config subcommand
     */
    private configSubcommand = async (): Promise<void> => {
        // Check if user has required permissions
        if (!this.interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
            await this.interaction.reply({
                embeds: [new EmbedTemplate(this.client).error("You need Administrator permission to configure the ticket system.")],
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }

        // Get guild config
        const guildConfig = await this.ticketRepo.getGuildConfig(this.interaction.guildId!);
        if (!guildConfig) {
            await this.interaction.reply({
                embeds: [
                    new EmbedTemplate(this.client).error("Ticket system is not set up for this server.")
                        .setDescription("Use `/setup` command to set up the ticket system.")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }

        // Get component to configure
        const component = this.interaction.options.getString("component", true);

        // Handle configuration through the dedicated config handler
        await handleConfigComponent(this.interaction, this.client, this.ticketRepo, component);
    };

    /**
     * Handle the deploy subcommand
     */
    private deploySubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        // Check if user has required permissions
        if (!this.interaction.memberPermissions?.has(discord.PermissionFlagsBits.Administrator)) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("You need Administrator permission to deploy the ticket panel.")]
            });
            return;
        }

        // Get guild config
        const guildConfig = await this.ticketRepo.getGuildConfig(this.interaction.guildId!);
        if (!guildConfig) {
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).error("Ticket system is not set up for this server.")
                        .setDescription("Use `/setup` command to set up the ticket system.")
                ]
            });
            return;
        }

        // Get channel to deploy to
        const channel = this.interaction.options.getChannel("channel", true) as discord.TextChannel;
        if (!channel || !(channel instanceof discord.TextChannel)) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("Invalid channel selected. Please select a text channel.")]
            });
            return;
        }

        // Get button config
        const buttonConfig = await this.ticketRepo.getTicketButtonConfig(this.interaction.guildId!);
        if (!buttonConfig) {
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).error("Button configuration not found.")
                        .setDescription("Use `/setup` command to set up the ticket system properly.")
                ]
            });
            return;
        }

        // Create the embed
        const ticketEmbed = new discord.EmbedBuilder()
            .setTitle(buttonConfig.embedTitle || "Need Help?")
            .setDescription(buttonConfig.embedDescription || "Click the button below to create a ticket")
            .setColor((buttonConfig.embedColor || "#5865F2") as discord.ColorResolvable)
            .setFooter({ text: "Powered by Salt Bot", iconURL: this.client.user?.displayAvatarURL() })
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
            await this.ticketRepo.configureTicketButton(this.interaction.guildId!, {
                messageId: panelMessage.id,
                channelId: channel.id
            });

            // If using categories, update select menu config
            const categories = await this.ticketRepo.getTicketCategories(this.interaction.guildId!);
            if (categories.length > 1) {
                await this.ticketRepo.configureSelectMenu(this.interaction.guildId!, {
                    messageId: panelMessage.id
                });
            }

            // Send success message
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).success("Ticket panel deployed successfully!")
                        .setDescription(`The ticket panel has been deployed in ${channel}.`)
                ]
            });
        } catch (error) {
            this.client.logger.error(`[TICKET_DEPLOY] Error deploying ticket panel: ${error}`);
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).error("Failed to deploy ticket panel.")
                        .setDescription("Make sure the bot has permission to send messages in the selected channel.")
                ]
            });
        }
    };

    /**
     * Handle the close subcommand
     */
    private closeSubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await this.ticketRepo.getTicketByChannelId(this.interaction.channelId);
        if (!ticket) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        // Check if the ticket is already closed
        if (ticket.status !== "open") {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This ticket is already closed.")]
            });
            return;
        }

        // Get optional reason
        const reason = this.interaction.options.getString("reason") || "No reason provided";

        // Update ticket status in database
        await this.ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.CLOSED,
            this.interaction.user.id,
            reason
        );

        // Get the ticket message configuration
        const ticketMessage = await this.ticketRepo.getTicketMessage(ticket.category.id);
        const category = ticket.category;

        // Create close message embed
        const closeEmbed = new discord.EmbedBuilder()
            .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
            .setDescription(ticketMessage?.closeMessage || "This ticket has been closed.")
            .addFields(
                { name: "Ticket ID", value: `#${ticket.ticketNumber}`, inline: true },
                { name: "Category", value: `${category.emoji || "🎫"} ${category.name}`, inline: true },
                { name: "Status", value: `🔴 Closed`, inline: true },
                { name: "Closed By", value: `<@${this.interaction.user.id}>`, inline: true },
                { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: "Reason", value: reason, inline: false }
            )
            .setColor("Red")
            .setFooter({ text: `Use /ticket reopen to reopen this ticket | ID: ${ticket.id}` })
            .setTimestamp();

        // Get the channel
        const channel = this.interaction.channel as discord.TextChannel;

        // Send close message
        await channel.send({ embeds: [closeEmbed] });

        // Update channel permissions to prevent further messages
        try {
            await channel.permissionOverwrites.create(
                this.interaction.guild!.roles.everyone,
                { SendMessages: false }
            );

            // Create action row with buttons
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

            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).success("Ticket closed successfully.")],
                components: [actionRow]
            });

            try {
                // Create and send transcript
                await createAndSendTranscript(
                    channel,
                    this.interaction.user,
                    reason,
                    ticket.id,
                    this.ticketRepo.dataSource
                );
            } catch (error) {
                this.client.logger.error(`[TICKET_CLOSE] Error creating transcript: ${error}`);
            }
        } catch (error) {
            this.client.logger.error(`[TICKET_CLOSE] Error updating permissions: ${error}`);
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).warning("Ticket marked as closed, but could not update channel permissions.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    };

    /**
     * Handle the reopen subcommand
     */
    private reopenSubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await this.ticketRepo.getTicketByChannelId(this.interaction.channelId);
        if (!ticket) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        // Check if the ticket is already open
        if (ticket.status === "open") {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This ticket is already open.")]
            });
            return;
        }

        // Update ticket status in database
        await this.ticketRepo.updateTicketStatus(
            ticket.id,
            ITicketStatus.OPEN
        );

        // Get the channel
        const channel = this.interaction.channel as discord.TextChannel;

        // Create reopen message embed
        const reopenEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Reopened")
            .setDescription("This ticket has been reopened.")
            .addFields(
                { name: "Reopened By", value: `<@${this.interaction.user.id}>`, inline: true }
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
                this.interaction.guild!.roles.everyone,
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

            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).success("Ticket reopened successfully.")],
                components: [actionRow]
            });
        } catch (error) {
            this.client.logger.error(`[TICKET_REOPEN] Error updating permissions: ${error}`);
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).warning("Ticket marked as reopened, but could not update channel permissions.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    };

    /**
     * Handle the add user subcommand
     */
    private addUserSubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await this.ticketRepo.getTicketByChannelId(this.interaction.channelId);
        if (!ticket) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        // Get user to add
        const user = this.interaction.options.getUser("user");
        if (!user) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("Please provide a valid user to add.")]
            });
            return;
        }

        // Get the channel
        const channel = this.interaction.channel as discord.TextChannel;

        try {
            // Add user to ticket channel
            await channel.permissionOverwrites.create(
                user.id,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

            // Confirmation message
            const addEmbed = new discord.EmbedBuilder()
                .setTitle("User Added")
                .setDescription(`${user} has been added to the ticket.`)
                .setColor("Green")
                .setFooter({ text: `Added by ${this.interaction.user.tag}` })
                .setTimestamp();

            await channel.send({ embeds: [addEmbed] });

            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).success(`Successfully added ${user.tag} to the ticket.`)]
            });
        } catch (error) {
            this.client.logger.error(`[TICKET_ADD] Error adding user to ticket: ${error}`);
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).error("Failed to add user to the ticket.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ]
            });
        }
    };

    /**
     * Handle the remove user subcommand
     */
    private removeUserSubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await this.ticketRepo.getTicketByChannelId(this.interaction.channelId);
        if (!ticket) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        // Get user to remove
        const user = this.interaction.options.getUser("user");
        if (!user) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("Please provide a valid user to remove.")]
            });
            return;
        }

        // Prevent removing ticket creator or support role members
        if (user.id === ticket.creatorId) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("You cannot remove the ticket creator.")]
            });
            return;
        }

        // Get the channel
        const channel = this.interaction.channel as discord.TextChannel;

        try {
            // Check if the user has a support role
            let hasRolePermission = false;
            if (ticket.category.supportRoleId) {
                try {
                    const member = await this.interaction.guild!.members.fetch(user.id);
                    if (member.roles.cache.has(ticket.category.supportRoleId)) {
                        hasRolePermission = true;
                    }
                } catch (error) {
                    // Ignore error if member not found
                    this.client.logger.debug(`[TICKET_REMOVE] Could not fetch member: ${error}`);
                }
            }

            // Warn if trying to remove a support staff
            if (hasRolePermission) {
                const confirmEmbed = new discord.EmbedBuilder()
                    .setTitle("⚠️ Warning")
                    .setDescription(`${user.tag} appears to be support staff. Are you sure you want to remove them?`)
                    .setColor("Orange");

                const confirmRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                    .addComponents(
                        new discord.ButtonBuilder()
                            .setCustomId("confirm_remove")
                            .setLabel("Yes, Remove")
                            .setStyle(discord.ButtonStyle.Danger),
                        new discord.ButtonBuilder()
                            .setCustomId("cancel_remove")
                            .setLabel("Cancel")
                            .setStyle(discord.ButtonStyle.Secondary)
                    );

                const response = await this.interaction.editReply({
                    embeds: [confirmEmbed],
                    components: [confirmRow]
                });

                // Create collector for confirmation
                try {
                    const confirmation = await (response as discord.Message).awaitMessageComponent({
                        filter: i => i.user.id === this.interaction.user.id,
                        time: 30000
                    });

                    if (confirmation.customId === "cancel_remove") {
                        await confirmation.update({
                            embeds: [new EmbedTemplate(this.client).info("User removal canceled.")],
                            components: []
                        });
                        return;
                    }

                    await confirmation.deferUpdate();
                } catch (error) {
                    await this.interaction.editReply({
                        embeds: [new EmbedTemplate(this.client).error("Confirmation timed out. User not removed.")],
                        components: []
                    });
                    return;
                }
            }

            // Remove user from ticket channel
            await channel.permissionOverwrites.delete(user.id);

            // Confirmation message
            const removeEmbed = new discord.EmbedBuilder()
                .setTitle("User Removed")
                .setDescription(`${user} has been removed from the ticket.`)
                .setColor("Red")
                .setFooter({ text: `Removed by ${this.interaction.user.tag}` })
                .setTimestamp();

            await channel.send({ embeds: [removeEmbed] });

            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).success(`Successfully removed ${user.tag} from the ticket.`)],
                components: []
            });
        } catch (error) {
            this.client.logger.error(`[TICKET_REMOVE] Error removing user from ticket: ${error}`);
            await this.interaction.editReply({
                embeds: [
                    new EmbedTemplate(this.client).error("Failed to remove user from the ticket.")
                        .setDescription("Make sure the bot has the necessary permissions to modify channel permissions.")
                ],
                components: []
            });
        }
    };

    /**
     * Handle the info subcommand
     */
    private infoSubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        // Check if the command is being used in a ticket channel
        const ticket = await this.ticketRepo.getTicketByChannelId(this.interaction.channelId);
        if (!ticket) {
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("This is not a valid ticket channel.")]
            });
            return;
        }

        try {
            // Get creator and closer information
            let creatorInfo = "Unknown User";
            let closerInfo = "N/A";

            try {
                const creator = await this.client.users.fetch(ticket.creatorId);
                creatorInfo = `${creator.tag} (${creator.id})`;
            } catch (error) {
                this.client.logger.warn(`[TICKET_INFO] Could not fetch creator: ${error}`);
            }

            if (ticket.closedById) {
                try {
                    const closer = await this.client.users.fetch(ticket.closedById);
                    closerInfo = `${closer.tag} (${closer.id})`;
                } catch (error) {
                    this.client.logger.warn(`[TICKET_INFO] Could not fetch closer: ${error}`);
                    closerInfo = `Unknown (${ticket.closedById})`;
                }
            }

            // Format dates
            const createdAt = Math.floor(new Date(ticket.createdAt).getTime() / 1000);
            const closedAtTimestamp = ticket.closedAt ? Math.floor(new Date(ticket.closedAt).getTime() / 1000) : null;

            // Create info embed
            const infoEmbed = new discord.EmbedBuilder()
                .setTitle(`Ticket Information: #${ticket.ticketNumber}`)
                .setDescription(`This is a detailed view of ticket #${ticket.ticketNumber}.`)
                .addFields(
                    { name: "Status", value: ticket.status === "open" ? "🟢 Open" : "🔴 Closed", inline: true },
                    { name: "Category", value: `${ticket.category.emoji || "🎫"} ${ticket.category.name}`, inline: true },
                    { name: "Created At", value: `<t:${createdAt}:F>`, inline: true },
                    { name: "Created By", value: creatorInfo, inline: false }
                )
                .setColor(ticket.status === "open" ? "Green" : "Red")
                .setFooter({ text: `Ticket ID: ${ticket.id}` })
                .setTimestamp();

            // Add close information if ticket is closed
            if (ticket.status !== "open" && closedAtTimestamp) {
                infoEmbed.addFields(
                    { name: "Closed At", value: `<t:${closedAtTimestamp}:F>`, inline: true },
                    { name: "Closed By", value: closerInfo, inline: true },
                    { name: "Close Reason", value: ticket.closeReason || "No reason provided", inline: false }
                );
            }

            await this.interaction.editReply({ embeds: [infoEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_INFO] Error getting ticket info: ${error}`);
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("An error occurred while retrieving ticket information.")]
            });
        }
    };

    /**
     * Handle the stats subcommand
     */
    private statsSubcommand = async (): Promise<void> => {
        await this.interaction.deferReply();

        try {
            // Get ticket statistics
            const stats = await this.ticketRepo.getGuildTicketStats(this.interaction.guildId!);

            // Generate category breakdown
            let categoryBreakdown = "";
            for (const [category, count] of Object.entries(stats.categoryCounts)) {
                categoryBreakdown += `**${category}**: ${count} tickets\n`;
            }

            if (!categoryBreakdown) {
                categoryBreakdown = "No categories found.";
            }

            // Calculate percentages
            const openPercentage = stats.totalTickets > 0
                ? Math.round((stats.openTickets / stats.totalTickets) * 100)
                : 0;

            const closedPercentage = stats.totalTickets > 0
                ? Math.round((stats.closedTickets / stats.totalTickets) * 100)
                : 0;

            const archivedPercentage = stats.totalTickets > 0
                ? Math.round((stats.archivedTickets / stats.totalTickets) * 100)
                : 0;

            // Create stats embed
            const statsEmbed = new discord.EmbedBuilder()
                .setTitle("📊 Ticket System Statistics")
                .setDescription(`Here are the ticket statistics for this server.`)
                .addFields(
                    {
                        name: "Total Tickets",
                        value: `${stats.totalTickets} tickets created in total`,
                        inline: false
                    },
                    {
                        name: "Current Status",
                        value:
                            `🟢 **Open**: ${stats.openTickets} (${openPercentage}%)\n` +
                            `🔴 **Closed**: ${stats.closedTickets} (${closedPercentage}%)\n` +
                            `📦 **Archived**: ${stats.archivedTickets} (${archivedPercentage}%)`,
                        inline: false
                    },
                    {
                        name: "Category Breakdown",
                        value: categoryBreakdown,
                        inline: false
                    }
                )
                .setColor("Blue")
                .setFooter({ text: "Ticket System Statistics" })
                .setTimestamp();

            await this.interaction.editReply({ embeds: [statsEmbed] });
        } catch (error) {
            this.client.logger.error(`[TICKET_STATS] Error getting ticket statistics: ${error}`);
            await this.interaction.editReply({
                embeds: [new EmbedTemplate(this.client).error("An error occurred while retrieving ticket statistics.")]
            });
        }
    };
}