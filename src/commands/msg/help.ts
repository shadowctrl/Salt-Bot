import discord from "discord.js";
import Formatter from "../../utils/format";
import { wait } from "../../utils/extras";
import { EmbedTemplate } from "../../utils/embed_template";
import { Command } from "../../types";

const command: Command = {
    name: "help",
    description: "Lists all available message and slash commands with details",
    cooldown: 120,
    owner: false,
    execute: async (
        client: discord.Client,
        message: discord.Message,
        args: string[]
    ) => {
        try {
            const botUser = client.user;
            if (!botUser) return;

            let prefix = client.config.bot.command.disable_message ? '/' : client.config.bot.command.prefix;
            const uptime = Math.round(process.uptime());

            const sent = await message.reply("🏓 Finding all commands for you...");
            await wait(2000);

            const slashCommands = [...client.slashCommands.values()].filter(
                command => !command.owner
            );

            const msgCommands = client.config.bot.command.disable_message ? [] :
                [...client.commands.values()].filter(command => !command.owner);

            const addCommandFields = (
                commands: any[],
                embedBuilder: discord.EmbedBuilder,
                fieldTitle: string
            ) => {
                embedBuilder.addFields({ name: "", value: "\u200B", inline: false });
                if (commands.length === 0) return false;

                commands.sort((a, b) => {
                    const nameA = "data" in a ? a.data.name : a.name;
                    const nameB = "data" in b ? b.data.name : b.name;
                    return nameA.localeCompare(nameB);
                });

                const commandLines = commands.map(cmd => {
                    const name = "data" in cmd ? cmd.data.name : cmd.name;
                    const description = "data" in cmd ? cmd.data.description : cmd.description;
                    const cooldownText = cmd.cooldown ? ` (${cmd.cooldown}s cooldown)` : "";
                    const prefix = "data" in cmd ? "/" : client.config.bot.command.prefix;
                    return `> **${prefix}${name}** - ${description}${cooldownText}`;
                });

                let chunk = "";
                let fieldIndex = 1;

                for (const line of commandLines) {
                    if ((chunk + line + "\n").length > 1024) {
                        embedBuilder.addFields({
                            name: `${fieldTitle}${fieldIndex > 1 ? ` (continued)` : ""}`,
                            value: chunk.trim(),
                            inline: false
                        });
                        chunk = "";
                        fieldIndex++;
                    }
                    chunk += line + "\n";
                }

                if (chunk.length > 0) {
                    embedBuilder.addFields({
                        name: `${fieldTitle}${fieldIndex > 1 ? ` (continued)` : ""}`,
                        value: chunk.trim(),
                        inline: false
                    });
                }

                return true;
            };

            const embed = new discord.EmbedBuilder()
                .setAuthor({
                    name: `${botUser.username} Command Guide`,
                    iconURL: botUser.displayAvatarURL(),
                })
                .setDescription([
                    `🎫 **${botUser.username}** - Your premium ticket management solution, bringing professional support ticket handling to your server.`,
                    "",
                    "💡 **Features:**",
                    "• Create, close, and manage support tickets",
                    "• Customizable categories and staff roles",
                    "• Transcript saving for closed tickets",
                    "• Clean and simple user interface",
                    "",
                    `⚡ **Prefix:** \`${prefix}\``,
                    `⏰ **Uptime:** \`${Formatter.formatUptime(uptime)}\``,
                    "",
                    "📜 **Available Commands:**",
                ].join("\n")
                )
                .setColor("#5865F2")
                .setTimestamp();

            const slashAdded = addCommandFields(slashCommands, embed, "📘 Slash Commands");
            const msgAdded = addCommandFields(msgCommands, embed, "💬 Legacy Commands");

            if (!slashAdded && !msgAdded) {
                embed.setDescription("No commands available.");
            }

            embed.addFields({
                name: "⚡ Pro Tips",
                value: [
                    "• Use `/` to see all available slash commands",
                    "• Use this help command to get detailed descriptions",
                    "• Commands with cooldowns have a waiting period between uses",
                    "• Premium commands require a subscription to use"
                ].join("\n"),
                inline: false
            });
            embed.setThumbnail(message.author.displayAvatarURL() || null);
            embed.setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

            await sent.edit({ content: "", embeds: [embed] });

            client.logger.info(`[HELP] Help command executed by ${message.author.tag} (${message.author.id})`);
        } catch (error) {
            client.logger.error(`[HELP] Failed to load help info: ${error}`);
            await message.reply({
                embeds: [
                    new EmbedTemplate(client).error("Failed to load help information."),
                ],
            });
        }
    },
};

export default command;