import discord from "discord.js";

import { SlashCommand } from "../../../types";
import { Ticket } from "../../../core/ticket";
import { EmbedTemplate } from "../../../core/embed/template";

import { deployTicketSystem } from "./deploy";


const setupCommand: SlashCommand = {
    cooldown: 10,
    owner: false,
    userPerms: [discord.PermissionFlagsBits.Administrator],
    botPerms: [
        discord.PermissionFlagsBits.ManageChannels,
        discord.PermissionFlagsBits.SendMessages,
        discord.PermissionFlagsBits.ManageMessages,
        discord.PermissionFlagsBits.EmbedLinks,
        discord.PermissionFlagsBits.UseExternalEmojis
    ],
    data: new discord.SlashCommandBuilder()
        .setName("setup")
        .setDescription("Setup ticket system for your server")
        .addChannelOption(option =>
            option.setName("ticket_channel")
                .setDescription("Channel where users can create tickets")
                .addChannelTypes(
                    discord.ChannelType.GuildText,
                    discord.ChannelType.GuildAnnouncement
                )
                .setRequired(false))
        .addRoleOption(option =>
            option.setName("ticket_supporters")
                .setDescription("Role for ticket supporters")
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('transcript_channel')
                .setDescription('Channel where ticket transcripts will be sent')
                .addChannelTypes(discord.ChannelType.GuildText)
                .setRequired(false)),

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
            const guildConfig = await ticketRepo.getOrCreateGuildConfig(interaction.guildId!);

            const ticketChannel = interaction.options.getChannel("ticket_channel") || interaction.channel;
            if (!ticketChannel || !(ticketChannel instanceof discord.TextChannel)) {
                return interaction.editReply({
                    embeds: [new EmbedTemplate(client).error("Invalid ticket channel. Please specify a text channel.")]
                });
            }

            const supportersRole = interaction.options.getRole("ticket_supporters");
            const transcriptChannel = interaction.options.getChannel("transcript_channel") as discord.TextChannel | null;

            const ticketDiscordCategory = await interaction.guild!.channels.create({
                name: `${client.config.ticket.default.category.name} Ticket`,
                type: discord.ChannelType.GuildCategory,
                position: 0,
                permissionOverwrites: [
                    {
                        id: interaction.guild!.roles.everyone,
                        deny: [discord.PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: client.user!.id,
                        allow: [
                            discord.PermissionFlagsBits.ViewChannel,
                            discord.PermissionFlagsBits.SendMessages,
                            discord.PermissionFlagsBits.ManageChannels
                        ]
                    }
                ]
            });

            let supporterRole: discord.Role | null = null;
            if (supportersRole) {
                const guild = interaction.guild;
                if (guild) {
                    try {
                        supporterRole = await guild.roles.fetch(supportersRole.id) || null;
                        await ticketDiscordCategory.permissionOverwrites.create(
                            supporterRole?.id || "",
                            {
                                ViewChannel: true,
                                SendMessages: true,
                                ReadMessageHistory: true
                            }
                        );
                    } catch (err) {
                        client.logger.warn(`[SETUP] Failed to fetch role: ${err}`);
                    }
                }
            }

            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("🎫 Ticket System Setup")
                        .setDescription(
                            "Setting up your ticket system with basic configuration...\n\n" +
                            "You can customize all aspects of your ticket system later using `/ticket config`."
                        )
                        .addFields(
                            { name: "Ticket Channel", value: `${ticketChannel}`, inline: true },
                            {
                                name: "Support Role",
                                value: supporterRole ? `${supporterRole}` : "Not specified",
                                inline: true
                            },
                            {
                                name: "Transcript Channel",
                                value: transcriptChannel ? `${transcriptChannel}` : "Not specified",
                                inline: true
                            }
                        )
                        .setColor("Blue")
                ]
            });

            // 1. Configure the button
            await ticketRepo.configureTicketButton(interaction.guildId!, {
                label: client.config.ticket.default.button.label,
                emoji: client.config.ticket.default.button.emoji,
                style: client.config.ticket.default.button.style,
                channelId: ticketChannel.id,
                embedTitle: client.config.ticket.default.button.embed_title,
                embedDescription: client.config.ticket.default.button.embed_description,
                logChannelId: transcriptChannel ? transcriptChannel.id : undefined
            });

            // 2. Create a default category
            const defaultCategory = await ticketRepo.createTicketCategory(interaction.guildId!, {
                name: client.config.ticket.default.category.name,
                description: client.config.ticket.default.category.description,
                emoji: client.config.ticket.default.category.emoji,
                supportRoleId: supporterRole ? supporterRole.id : undefined,
                position: 0,
                categoryId: ticketDiscordCategory.id
            });

            // 3. Configure default messages for this category
            await ticketRepo.configureTicketMessages(defaultCategory.id, {
                welcomeMessage: client.config.ticket.default.message.welcome_message,
                closeMessage: client.config.ticket.default.message.close_message,
                includeSupportTeam: true
            });

            // 4. Configure select menu for future use (even though we're just using a single category now)
            await ticketRepo.configureSelectMenu(interaction.guildId!, {
                placeholder: client.config.ticket.default.select_menu.placeholder,
                minValues: 1,
                maxValues: 1,
                embedTitle: client.config.ticket.default.select_menu.embed_title,
                embedDescription: client.config.ticket.default.select_menu.embed_description,
            });

            const deployButtons = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                .addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId("deploy_now")
                        .setLabel("Deploy Now")
                        .setStyle(discord.ButtonStyle.Success)
                        .setEmoji("🚀"),
                    new discord.ButtonBuilder()
                        .setCustomId("deploy_later")
                        .setLabel("Deploy Later")
                        .setStyle(discord.ButtonStyle.Secondary)
                );

            const deployMessage = await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("🚀 Deploy Ticket System")
                        .setDescription(
                            "Your ticket system is configured! Ready to deploy it now?\n\n" +
                            "This will create the ticket panel in the specified channel.\n\n" +
                            "Click 'Deploy Now' to create the panel, or 'Deploy Later' to deploy it manually later."
                        )
                        .setColor("Blue")
                ],
                components: [deployButtons]
            });

            try {
                const collector = deployMessage.createMessageComponentCollector({
                    filter: (i) =>
                        (i.customId === "deploy_now" || i.customId === "deploy_later") &&
                        i.user.id === interaction.user.id,
                    time: 60000,
                    max: 1
                });

                collector.on("collect", async (buttonInteraction) => {
                    try {
                        await buttonInteraction.deferUpdate().catch(() => {
                            client.logger.debug("[SETUP] Failed to defer button update - interaction may have expired");
                        });

                        if (buttonInteraction.customId === "deploy_now") {
                            await deployTicketSystem(
                                buttonInteraction,
                                client,
                                ticketRepo,
                                ticketChannel as discord.TextChannel
                            );
                        } else {
                            await buttonInteraction.editReply({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setTitle("📝 Deployment Postponed")
                                        .setDescription(
                                            "You can deploy the ticket panel later using the `/ticket deploy` command.\n\n" +
                                            "Your settings have been saved."
                                        )
                                        .setColor("Orange")
                                ],
                                components: []
                            }).catch(() => {
                                interaction.followUp({
                                    embeds: [
                                        new EmbedTemplate(client).info("Setup complete! You can deploy the ticket panel later with `/ticket deploy`.")
                                    ],
                                    flags: discord.MessageFlags.Ephemeral
                                }).catch(() => { });
                            });
                        }
                    } catch (error) {
                        client.logger.error(`[SETUP] Error handling button interaction: ${error}`);
                        try {
                            await interaction.followUp({
                                embeds: [new EmbedTemplate(client).error("An error occurred during deployment.")],
                                flags: discord.MessageFlags.Ephemeral
                            });
                        } catch (followUpError) {
                            client.logger.error(`[SETUP] Failed to send followUp: ${followUpError}`);
                        }
                    }
                });

                collector.on("end", async (collected, reason) => {
                    if (reason === "time" && collected.size === 0) {
                        try {
                            await interaction.editReply({
                                embeds: [
                                    new EmbedTemplate(client).info("Setup completed, but deployment timed out. You can deploy your ticket system later using `/ticket deploy`.")
                                ],
                                components: []
                            });
                        } catch (error) {
                            client.logger.debug(`[SETUP] Failed to edit reply after timeout: ${error}`);
                        }
                    }
                });
            } catch (error) {
                client.logger.error(`[SETUP] Error creating collector: ${error}`);
                await interaction.editReply({
                    embeds: [
                        new EmbedTemplate(client).success("Setup complete!")
                            .setDescription("Your ticket system has been configured. You can deploy it using `/ticket deploy`.")
                    ],
                    components: []
                });
            }
        } catch (error) {
            client.logger.error(`[SETUP] Error in setup command: ${error}`);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                        flags: discord.MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("An error occurred during setup.")],
                        flags: discord.MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                client.logger.error(`[SETUP] Failed to send error response: ${replyError}`);
            }
        }
    }
};

export default setupCommand;