import discord from "discord.js";
import PremiumHandler from "../../utils/premium_handler";
import { EmbedTemplate } from "../../utils/embed_template";
import { Command } from "../../types";

const command: Command = {
    name: "generate",
    description: "Generate premium coupon codes | generate <duration> <count>",
    cooldown: 10,
    owner: true, // Only bot owners can use this command
    execute: async (
        client: discord.Client,
        message: discord.Message,
        args: Array<string>
    ) => {
        try {
            // Check if premium handler is available
            if (!(client as any).dataSource) {
                return message.reply({
                    embeds: [
                        new EmbedTemplate(client).error("Database connection is not available.")
                    ]
                });
            }

            const premiumHandler = new PremiumHandler((client as any).dataSource);

            // Parse arguments
            // Default values
            let count = 1;
            let duration = 30; // Default 30 days

            // Check duration parameter
            if (args.length > 0) {
                const durationArg = args[0].toLowerCase();

                switch (durationArg) {
                    case "1d":
                    case "day":
                    case "1day":
                        duration = 1;
                        break;
                    case "1w":
                    case "week":
                    case "1week":
                        duration = 7;
                        break;
                    case "1m":
                    case "month":
                    case "1month":
                        duration = 30;
                        break;
                    case "1y":
                    case "year":
                    case "1year":
                        duration = 365;
                        break;
                    default:
                        // Try to parse as a number
                        const parsedDuration = parseInt(durationArg);
                        if (!isNaN(parsedDuration) && parsedDuration > 0) {
                            duration = parsedDuration;
                        }
                }
            }

            // Check count parameter (optional second argument)
            if (args.length > 1) {
                const parsedCount = parseInt(args[1]);
                if (!isNaN(parsedCount) && parsedCount > 0 && parsedCount <= 10) {
                    count = parsedCount;
                }
            }

            // Generate coupons
            const coupons = await premiumHandler.generateCoupons(message.author.id, count, duration);

            if (!coupons || coupons.length === 0) {
                return message.reply({
                    embeds: [
                        new EmbedTemplate(client).error("Failed to generate coupon codes.")
                    ]
                });
            }

            // Format coupon codes for display
            let couponList = '';
            coupons.forEach((code, index) => {
                couponList += `**${index + 1}.** \`${code}\`\n`;
            });

            // Send the coupon codes
            const embed = new discord.EmbedBuilder()
                .setTitle("🎫 Premium Coupon Codes")
                .setDescription(
                    `Successfully generated ${coupons.length} premium coupon code(s) valid for **${duration} day(s)**.\n\n` +
                    couponList +
                    `\nUsers can redeem these codes with \`/premium redeem\` command.`
                )
                .setColor(client.config.embed.color.success)
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            // Check if it's a DM or a server
            if (!message.guild) {
                // DM - send directly
                await message.reply({ embeds: [embed] });
            } else {
                // Server - try to DM the user
                try {
                    await message.author.send({ embeds: [embed] });
                    await message.reply({
                        embeds: [
                            new EmbedTemplate(client).success("I have sent you a DM with your coupon codes.")
                        ]
                    });
                } catch (error) {
                    // If DM fails, send to channel with warning
                    await message.reply({
                        embeds: [
                            new EmbedTemplate(client).warning("I couldn't send you a DM. Here are your coupon codes:")
                        ]
                    });
                    await message.reply({ embeds: [embed] });
                }
            }

            // Log the coupon generation
            client.logger.info(`[GENERATE] ${message.author.tag} (${message.author.id}) generated ${coupons.length} coupon(s) valid for ${duration} day(s)`);

        } catch (error) {
            client.logger.error(`[GENERATE] Error generating coupons: ${error}`);
            await message.reply({
                embeds: [
                    new EmbedTemplate(client).error("An error occurred while generating coupon codes.")
                ]
            });
        }
    },
};

export default command;