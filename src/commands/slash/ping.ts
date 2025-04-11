import os from "os";
import discord from "discord.js";
import Formatter from "../../utils/format";
import { SlashCommand } from "../../types";

const pingCommand: SlashCommand = {
    cooldown: 120,
    owner: false,
    data: new discord.SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check bot status and response time"),
    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        try {
            const startTime = Date.now();
            await interaction.deferReply();

            const endTime = Date.now();
            const roundTripLatency = endTime - startTime;
            const heapUsed = Math.round(
                process.memoryUsage().heapUsed / 1024 / 1024
            );
            const totalMem = Math.round(os.totalmem() / 1024 / 1024);
            const freeMem = Math.round(os.freemem() / 1024 / 1024);
            const usedMem = totalMem - freeMem;
            const uptime = Math.round(process.uptime());

            const embed = new discord.EmbedBuilder()
                .setTitle("🤖 Bot Status")
                .setDescription("> System metrics and performance data")
                .addFields(
                    {
                        name: "📊 Latency",
                        value: [
                            `• **Roundtrip**: \`${roundTripLatency}ms\``,
                            `• **API**: \`${client.ws.ping}ms\``,
                            `• **Uptime**: \`${Formatter.formatUptime(
                                uptime
                            )}\``,
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "💾 Memory",
                        value: [
                            `• **Heap**: \`${heapUsed}MB\``,
                            `• **Used**: \`${usedMem}MB\``,
                            `• **Total**: \`${totalMem}MB\``,
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "🔧 System",
                        value: [
                            `• **Platform**: \`${process.platform}\``,
                            `• **Node**: \`${process.version}\``,
                            `• **CPU**: \`${os.cpus()[0].model}\``,
                        ].join("\n"),
                        inline: true,
                    }
                )
                .setColor("#2B2D31")
                .setFooter({ text: `${client.user?.username} Status Monitor` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error(
                `[PING] Failed to fetch system status: ${error}`
            );
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(
                            "An error occurred while fetching system status."
                        )
                        .setColor(client.config.embed.color.error)
                ],
                flags: discord.MessageFlags.Ephemeral,
            });
        }
    },
};

export default pingCommand;
