import path from "path";
import fs from "fs/promises";
import discord from "discord.js";
import Formatter from "../../utils/format";
import { EmbedTemplate } from "../../utils/embed_template";
import { Command, SlashCommand }  from "../../types";

/**
 * Recursively load command files from directories
 * @param directory Base directory to search in
 * @param fileFilter Function to filter command files
 * @returns Array of loaded commands
 */
const loadCommandsRecursive = async (
    directory: string,
    fileFilter: (file: string) => boolean
): Promise<(Command | SlashCommand)[]> => {
    const commands: (Command | SlashCommand)[] = [];
    const items = await fs.readdir(directory, { withFileTypes: true });

    for (const item of items) {
        const itemPath = path.join(directory, item.name);

        if (item.isDirectory()) {
            const subCommands = await loadCommandsRecursive(itemPath, fileFilter);
            commands.push(...subCommands);
        } else if (fileFilter(item.name)) {
            try {
                const { default: command } = await import(itemPath);

                if (command) {
                    commands.push(command);
                }
            } catch (error) {
                console.error(`Failed to load command from ${itemPath}:`, error);
            }
        }
    }

    return commands;
};

const helpCommand: SlashCommand = {
    cooldown: 120,
    owner: false,
    data: new discord.SlashCommandBuilder()
        .setName("help")
        .setDescription("Lists all available message commands with details"),
    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        try {
            await interaction.deferReply();

            const botUser = client.user;
            if (!botUser) return;

            let prefix = client.config.bot.command.prefix;

            const uptime = Math.round(process.uptime());
    
            // Load Slash Commands
            const slashCommandsDir = path.join(__dirname, "../../commands/slash");
            const loadedSlashCommands = (await loadCommandsRecursive(
                slashCommandsDir,
                (file) => (file.endsWith(".js") || file.endsWith(".ts")) && !file.includes(".d.ts")
            )) as SlashCommand[];
    
            // Load Message Commands
            const messageCommandsDir = path.join(__dirname, "../../commands/msg");
            const loadedMsgCommands = (await loadCommandsRecursive(
                messageCommandsDir,
                (file) => (file.endsWith(".js") || file.endsWith(".ts")) && !file.includes(".d.ts")
            )) as Command[];

            const slashCommands = [...loadedSlashCommands].filter(
                command => !command.owner
            )
            const msgCommands= [...loadedMsgCommands].filter(
                command => !command.owner
            )

            const addCommandFields = (
                commands: (Command | SlashCommand)[],
                embedBuilder: discord.EmbedBuilder,
                fieldTitle: string
            ) => {
                // Add a blank field to separate sections
                embedBuilder.addFields({ name: "", value: "\n", inline: false });

                if (commands.length === 0) return false;
            
                const seen = new Set<string>();
                const uniqueCommands = commands.filter(cmd => {
                    const name = "data" in cmd ? cmd.data.name : cmd.name;
                    if (seen.has(name)) return false;
                    seen.add(name);
                    return true;
                });

                uniqueCommands.sort((a, b) => {
                    const nameA = "data" in a ? a.data.name : a.name;
                    const nameB = "data" in b ? b.data.name : b.name;
                    return nameA.localeCompare(nameB);
                });

                const commandLines = uniqueCommands.map(cmd => {
                    const name = "data" in cmd ? cmd.data.name : cmd.name;
                    const description = "data" in cmd ? cmd.data.description : cmd.description;
                    const cooldownText = cmd.cooldown ? ` (${cmd.cooldown}s cooldown)` : "";
                    const prefix = "data" in cmd ? "/" : "!";
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
                        "🧂 **Salt Ticketing Tool** - is your ticket management tool, bringing high-quality support ticket management to your server.",
                        "",
                        "💡 **Features:**",
                        "• Create, close, and manage support tickets",
                        "• Customizable categories and staff roles",
                        "• Transcript saving for closed tickets",
                        "• Clean and simple user interface",
                        "",
                        `⚡ **Prefix:** \`${prefix}\``,
                        `⏰ **Uptime:** \`${Formatter.formatUptime(
                            uptime
                        )}\``,
                        "",
                        "📜 **Available Commands:**",
                    ].join("\n")
                )
                .setColor("#5865F2")
                .setFooter({ text: `Requested by ${client.user?.username}` })
                .setTimestamp();

            const slashAdded = addCommandFields(slashCommands, embed, "📘 Slash Commands");
            const msgAdded = addCommandFields(msgCommands, embed, "💬 Legacy Commands");

            if (!slashAdded && !msgAdded) {
                embed.setDescription("No regular commands available.");
            }

            embed.addFields({
            name: "⚡ Pro Tips",
            value: [
                "• Use `/` to see all available slash commands",
                "• Use `/help` to get commands with description",
                "• Commands with cooldowns have a waiting period between uses",
                "• Premium commands require a subscription to use"
            ].join("\n"),
            inline: false
            });
            embed.setThumbnail(interaction.user.displayAvatarURL() || "");
            embed.setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
    
            await interaction.editReply({ embeds: [embed] });

            client.logger.info(`[HELP] Help command executed by ${interaction.user.tag} (${interaction.user.id})`);
    
        } catch (error) {
            client.logger.error(`[HELP] Failed to load help command: ${error}`);
            await interaction.followUp({
                embeds: [new EmbedTemplate(client).error("Failed to load help information.")],
                ephemeral: true,
            });
        }
    }        
};

export default helpCommand;
