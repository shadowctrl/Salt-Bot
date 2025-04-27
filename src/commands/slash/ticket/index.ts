import discord from "discord.js";
import { SlashCommand } from "../../../types";
import { TicketCommandManager } from "./manager";
import { TicketRepository } from "../../../events/database/repo/ticket_system";
import { EmbedTemplate } from "../../../utils/embed_template";

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
                    flags: discord.MessageFlags.Ephemeral
                });
            }

            // Get the ticket repository
            const ticketRepo = new TicketRepository((client as any).dataSource);

            // Create a command manager and execute the appropriate subcommand
            const commandManager = new TicketCommandManager(interaction, client, ticketRepo);
            await commandManager.execute();
        } catch (error) {
            client.logger.error(`[TICKET] Error in ticket command: ${error}`);

            // Try to respond if possible
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [new EmbedTemplate(client).error("An error occurred while executing the command.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("An error occurred while executing the command.")],
                    flags: discord.MessageFlags.Ephemeral
                });
            }
        }
    }
};

export default ticketCommand;