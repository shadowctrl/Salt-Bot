import discord from "discord.js";
import { Command } from "../../types";
import { EmbedTemplate } from "../../core/embed/template";
import { BlockedUserRepository } from "../../events/database/repo/blocked_users";

const command: Command = {
    name: "block",
    description: "Manage user block status | block <add/remove/status> <user> [reason]",
    cooldown: 5,
    owner: true,
    execute: async (
        client: discord.Client,
        message: discord.Message,
        args: Array<string>
    ) => {
        try {
            if (args.length < 2) {
                await message.reply({
                    embeds: [
                        new EmbedTemplate(client).error("Invalid usage.")
                            .setDescription(
                                "**Usage:**\n" +
                                `• \`${client.config.bot.command.prefix}block add @user <reason>\` - Block a user\n` +
                                `• \`${client.config.bot.command.prefix}block remove @user <reason>\` - Unblock a user\n` +
                                `• \`${client.config.bot.command.prefix}block status @user\` - Check block status`
                            )
                    ]
                });
                return;
            }

            const subcommand = args[0].toLowerCase();

            if (!["add", "remove", "status"].includes(subcommand)) {
                await message.reply({
                    embeds: [
                        new EmbedTemplate(client).error("Invalid subcommand.")
                            .setDescription("Valid subcommands are: `add`, `remove`, `status`")
                    ]
                });
                return;
            }

            const userArg = args[1];
            let user: discord.User | null = null;
            const mentionMatch = userArg.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
                try {
                    user = await client.users.fetch(mentionMatch[1]);
                } catch (error) {
                    client.logger.warn(`[BLOCK] Could not fetch user from mention: ${error}`);
                }
            } else if (/^\d+$/.test(userArg)) {
                try {
                    user = await client.users.fetch(userArg);
                } catch (error) {
                    client.logger.warn(`[BLOCK] Could not fetch user from ID: ${error}`);
                }
            }

            if (!user) {
                await message.reply({
                    embeds: [
                        new EmbedTemplate(client).error("Invalid user.")
                            .setDescription("Please provide a valid user mention (@user) or user ID.")
                    ]
                });
                return;
            }

            const blockedUserRepo = new BlockedUserRepository((client as any).dataSource);

            switch (subcommand) {
                case "add": {
                    if (args.length < 3) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).error("Please provide a reason for blocking the user.")
                            ]
                        });
                        return;
                    }

                    const reason = args.slice(2).join(" ");

                    if (reason.length > 500) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).error("Reason is too long. Please keep it under 500 characters.")
                            ]
                        });
                        return;
                    }

                    const result = await blockedUserRepo.blockUser(user.id, reason);

                    if (result) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).success("User blocked successfully!")
                                    .setDescription(`**User:** ${user.tag} (${user.id})\n**Reason:** ${reason}`)
                                    .setThumbnail(user.displayAvatarURL())
                            ]
                        });

                        client.logger.info(`[BLOCK] ${message.author.tag} blocked ${user.tag} (${user.id}) for: ${reason}`);
                    } else {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).error("Failed to block user.")
                                    .setDescription("Database operation failed. Please try again.")
                            ]
                        });
                    }
                    break;
                }

                case "remove": {
                    if (args.length < 3) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).error("Please provide a reason for unblocking the user.")
                            ]
                        });
                        return;
                    }

                    const reason = args.slice(2).join(" ");

                    if (reason.length > 500) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).error("Reason is too long. Please keep it under 500 characters.")
                            ]
                        });
                        return;
                    }

                    const unblocked = await blockedUserRepo.unblockUser(user.id, reason);

                    if (unblocked) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).success("User unblocked successfully!")
                                    .setDescription(`**User:** ${user.tag} (${user.id})\n**Reason:** ${reason}`)
                                    .setThumbnail(user.displayAvatarURL())
                            ]
                        });

                        client.logger.info(`[BLOCK] ${message.author.tag} unblocked ${user.tag} (${user.id}) for: ${reason}`);
                    } else {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).error("Failed to unblock user.")
                                    .setDescription("User might not be blocked or database operation failed.")
                            ]
                        });
                    }
                    break;
                }

                case "status": {
                    const blockedUser = await blockedUserRepo.findByUserId(user.id);

                    if (!blockedUser) {
                        await message.reply({
                            embeds: [
                                new EmbedTemplate(client).info("User has never been blocked.")
                                    .setDescription(`**User:** ${user.tag} (${user.id})`)
                                    .setThumbnail(user.displayAvatarURL())
                            ]
                        });
                        return;
                    }

                    const embed = new discord.EmbedBuilder()
                        .setTitle(`Block Status for ${user.tag}`)
                        .setDescription(`Current status: ${blockedUser.status ? "🚫 **BLOCKED**" : "✅ **NOT BLOCKED**"}`)
                        .setColor(blockedUser.status ? "#FF0000" : "#00FF00")
                        .setThumbnail(user.displayAvatarURL())
                        .setFooter({ text: `User ID: ${user.id}` })
                        .setTimestamp();

                    if (blockedUser.data && blockedUser.data.length > 0) {
                        const sortedReasons = [...blockedUser.data].sort((a, b) =>
                            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                        );

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

                    await message.reply({ embeds: [embed] });
                    break;
                }

                default:
                    await message.reply({
                        embeds: [
                            new EmbedTemplate(client).error("Invalid subcommand.")
                        ]
                    });
            }
        } catch (error) {
            client.logger.error(`[BLOCK] Error managing user block status: ${error}`);
            await message.reply({
                embeds: [
                    new EmbedTemplate(client).error("An error occurred while managing user block status.")
                ]
            });
        }
    },
};

export default command;