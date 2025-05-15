import discord from "discord.js";
import client from "../salt";
import { TicketRepository } from "../events/database/repo/ticket_system";
import { ITicketStatus } from "../events/database/entities/ticket_system";

/**
 * Creates a new ticket for a user
 * 
 * @param interaction - The interaction that triggered the ticket creation
 * @param categoryId - The ID of the ticket category
 * @returns A promise that resolves when the ticket is created
 */
export const createTicket = async (
    interaction: discord.ButtonInteraction | discord.StringSelectMenuInteraction,
    categoryId: string
): Promise<void> => {
    try {
        // Get data source from client
        const dataSource = (client as any).dataSource;
        if (!dataSource) {
            throw new Error("Database connection not available");
        }

        // Get ticket repository
        const ticketRepo = new TicketRepository(dataSource);

        // Get category
        const category = await ticketRepo.getTicketCategory(categoryId);
        if (!category) {
            throw new Error("Category not found");
        }

        // Check if the user already has an open ticket
        const guildTickets = await ticketRepo.getGuildTickets(interaction.guildId!);
        const userOpenTickets = guildTickets.filter(ticket =>
            ticket.creatorId === interaction.user.id &&
            ticket.status === ITicketStatus.OPEN
        );

        if (userOpenTickets.length > 0) {
            // User already has a ticket
            const existingTicket = userOpenTickets[0];
            const ticketChannel = client.channels.cache.get(existingTicket.channelId) as discord.TextChannel;

            if (ticketChannel) {
                await interaction.reply({
                    embeds: [
                        new discord.EmbedBuilder()
                            .setTitle("Existing Ticket Found")
                            .setDescription(`You already have an open ticket: ${ticketChannel}\n\nPlease use your existing ticket or close it before creating a new one.`)
                            .setColor("Red")
                    ],
                    flags: discord.MessageFlags.Ephemeral
                });
                return;
            } else {
                // Channel no longer exists, mark as closed in database
                await ticketRepo.updateTicketStatus(
                    existingTicket.id,
                    ITicketStatus.CLOSED,
                    "system",
                    "Ticket channel was deleted"
                );
            }
        }

        // Update interaction response to show loading
        await interaction.reply({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Creating Ticket")
                    .setDescription("Please wait while we create your ticket...")
                    .setColor("Blue")
            ],
            flags: discord.MessageFlags.Ephemeral
        });

        // Generate channel name (temporary)
        const tempChannelName = `ticket-new`;

        // Create ticket channel
        const guild = interaction.guild!;

        try {
            const ticketChannel = await guild.channels.create({
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

            // Create ticket in database with the channel ID
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

            // Create action row with buttons
            const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("ticket_claim")
                        .setLabel("Claim Ticket")
                        .setStyle(discord.ButtonStyle.Primary)
                        .setEmoji("👋"),
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

            // Update interaction response to show success
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Ticket Created Successfully")
                        .setDescription(`Your ticket has been created: ${ticketChannel}\nTicket Number: #${ticket.ticketNumber}`)
                        .setColor("Green")
                ]
            });

            // Log ticket creation
            client.logger.info(`[TICKET_CREATE] User ${interaction.user.tag} created ticket #${ticket.ticketNumber} in category ${category.name}`);
        } catch (error) {
            client.logger.error(`[TICKET_CREATE] Failed to create ticket channel: ${error}`);
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Error Creating Ticket")
                        .setDescription("Failed to create ticket channel. Please try again later or contact an administrator.")
                        .setColor("Red")
                ]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CREATE] Error creating ticket: ${error}`);

        // Try to reply to the interaction if it hasn't been acknowledged yet
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Error Creating Ticket")
                        .setDescription("An error occurred while creating your ticket. Please try again later.")
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        } else {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("Error Creating Ticket")
                        .setDescription("An error occurred while creating your ticket. Please try again later.")
                        .setColor("Red")
                ]
            });
        }
    }
};