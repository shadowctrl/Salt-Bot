import os from "os";
import discord from "discord.js";
import Formatter from "../../utils/format";
import { wait } from "../../utils/extras";
import { Command } from "../../types";

const command: Command = {
    name: "ping",
    description: "Check bot status and response time",
    cooldown: 120,
    owner: false,
    execute: async (
        client: discord.Client,
        message: discord.Message,
        args: Array<string>
    ) => {
        try {
            const sent = await message.reply("🏓 Pinging...");

            await wait(2000);

            const roundTripLatency =
                sent.createdTimestamp - message.createdTimestamp;
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

            await sent.edit({ content: "", embeds: [embed] }).catch((error) => {
                client.logger.error(
                    `[PING] Failed to edit ping message: ${error}`
                );
            });
        } catch (error) {
            client.logger.error(
                `[PING] Failed to fetch system status: ${error}`
            );
            await message.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(
                            "An error occurred while fetching the system status."
                        )
                        .setColor(client.config.embed.color.error),
                ],
            });
        }
    },
};

export default command;
