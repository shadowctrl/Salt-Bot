import discord from "discord.js";
import { SlashCommand } from "../../types";
import { BlockedUserRepository } from "../../events/database/repo/blocked_users";

const blockCommand: SlashCommand = {
    cooldown: 5,
    owner: true,
    data: new discord.SlashCommandBuilder()
        .setName("block")
        .setDescription("Manage user block status")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Block a user from using the bot")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The user to block")
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("The reason for blocking the user")
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Unblock a user")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The user to unblock")
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("The reason for unblocking the user")
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Check the block status of a user")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The user to check")
                        .setRequired(true))),
    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        // Immediately acknowledge the interaction to prevent timeout
        await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser("user");

        if (!user) {
            return interaction.editReply({
                content: "Please provide a valid user"
            });
        }

        try {
            // Get repository from the client's dataSource
            const blockedUserRepo = new BlockedUserRepository((client as any).dataSource);

            switch (subcommand) {
                case "add": {
                    const reason = interaction.options.getString("reason");
                    if (!reason) {
                        return interaction.editReply({
                            content: "Please provide a valid reason"
                        });
                    }

                    const result = await blockedUserRepo.blockUser(user.id, reason);
                    if (result) {
                        return interaction.editReply({
                            content: `Successfully blocked ${user.tag} for reason: ${reason}`
                        });
                    } else {
                        return interaction.editReply({
                            content: `Failed to block ${user.tag}. Database operation failed.`
                        });
                    }
                }

                case "remove": {
                    const reason = interaction.options.getString("reason");
                    if (!reason) {
                        return interaction.editReply({
                            content: "Please provide a valid reason"
                        });
                    }

                    const unblocked = await blockedUserRepo.unblockUser(user.id, reason);
                    if (unblocked) {
                        return interaction.editReply({
                            content: `Successfully unblocked ${user.tag} for reason: ${reason}`
                        });
                    } else {
                        return interaction.editReply({
                            content: `Failed to unblock ${user.tag}. User might not be blocked or database operation failed.`
                        });
                    }
                }

                case "status": {
                    // Get user block info
                    const blockedUser = await blockedUserRepo.findByUserId(user.id);

                    if (!blockedUser) {
                        return interaction.editReply({
                            content: `User ${user.tag} has never been blocked.`
                        });
                    }

                    // Create an embed to display the information
                    const embed = new discord.EmbedBuilder()
                        .setTitle(`Block Status for ${user.tag}`)
                        .setDescription(`Current status: ${blockedUser.status ? "🚫 **BLOCKED**" : "✅ **NOT BLOCKED**"}`)
                        .setColor(blockedUser.status ? "#FF0000" : "#00FF00")
                        .setThumbnail(user.displayAvatarURL())
                        .setFooter({ text: `User ID: ${user.id}` })
                        .setTimestamp();

                    // Add block history if available
                    if (blockedUser.data && blockedUser.data.length > 0) {
                        // Sort by timestamp, newest first
                        const sortedReasons = [...blockedUser.data].sort((a, b) =>
                            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                        );

                        // Add the most recent 10 reasons to the embed
                        const recentReasons = sortedReasons.slice(0, 10);

                        let historyText = "";
                        recentReasons.forEach((reason, index) => {
                            const date = new Date(reason.timestamp);
                            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                            const isUnblock = reason.reason.startsWith("UNBLOCKED:");

                            historyText += `${index + 1}. ${isUnblock ? "✅" : "🚫"} **${reason.reason.slice(0, 100)}${reason.reason.length > 100 ? '...' : ''}**\n`;
                            historyText += `   *${formattedDate}*\n\n`;
                        });

                        embed.addFields({
                            name: "Block History (Recent)",
                            value: historyText || "No block history found",
                        });

                        if (sortedReasons.length > 10) {
                            embed.addFields({
                                name: "Note",
                                value: `${sortedReasons.length - 10} more entries not shown`
                            });
                        }
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                default:
                    return interaction.editReply({
                        content: "Invalid subcommand"
                    });
            }
        } catch (error) {
            client.logger.error(`[BLOCK] Error managing user block status: ${error}`);
            return interaction.editReply({
                content: "An error occurred while managing user block status"
            });
        }
    }
};

export default blockCommand;