import discord from "discord.js";
import PremiumHandler from "../../core/command/premium";
import { EmbedTemplate } from "../../core/embed/template";
import { SlashCommand } from "../../types";

const premiumCommand: SlashCommand = {
    cooldown: 10,
    owner: false,
    data: new discord.SlashCommandBuilder()
        .setName("premium")
        .setDescription("Manage premium subscription")
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Check your premium status"))
        .addSubcommand(subcommand =>
            subcommand
                .setName("redeem")
                .setDescription("Redeem a premium coupon code")
                .addStringOption(option =>
                    option.setName("code")
                        .setDescription("The premium coupon code")
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove your premium status (owner only)")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The user to remove premium from")
                        .setRequired(true))),
    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });

        try {
            const premiumHandler = new PremiumHandler((client as any).dataSource);
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case "status": {
                    const [isPremium, premiumExpire] = await premiumHandler.checkPremiumStatus(interaction.user.id);

                    const embed = new discord.EmbedBuilder()
                        .setTitle("🌟 Premium Status")
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setColor(isPremium ? "#FFD700" : "#36393F")
                        .setTimestamp();

                    if (isPremium && premiumExpire) {
                        const now = new Date();
                        const expireDate = new Date(premiumExpire);
                        const daysLeft = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                        embed.setDescription(
                            "✅ **You are a premium user!**\n\n" +
                            `Your premium subscription expires on: **${expireDate.toLocaleDateString()}**\n` +
                            `Time remaining: **${daysLeft} day(s)**\n\n` +
                            "Thank you for your support! You have access to all premium features."
                        );
                    } else {
                        embed.setDescription(
                            "❌ **You are not a premium user**\n\n" +
                            "Premium benefits include:\n" +
                            "• Access to exclusive commands\n" +
                            "• Higher usage limits\n" +
                            "• Priority support\n" +
                            "• And more!\n\n" +
                            "To upgrade, redeem a premium code with `/premium redeem`"
                        );
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case "redeem": {
                    const code = interaction.options.getString("code", true);
                    const success = await premiumHandler.redeemCoupon(code, interaction.user.id, 30);

                    if (success) {
                        const [_, premiumExpire] = await premiumHandler.checkPremiumStatus(interaction.user.id);
                        const expireDate = premiumExpire ? new Date(premiumExpire) : null;

                        const embed = new discord.EmbedBuilder()
                            .setTitle("🎉 Premium Activated!")
                            .setDescription(
                                "✅ **Coupon code successfully redeemed!**\n\n" +
                                `Your premium subscription is now active${expireDate ? ` until **${expireDate.toLocaleDateString()}**` : ''}.\n\n` +
                                "Thank you for your support! You now have access to all premium features."
                            )
                            .setColor("#FFD700")
                            .setTimestamp();

                        await interaction.editReply({ embeds: [embed] });

                        client.logger.info(`[PREMIUM] ${interaction.user.tag} (${interaction.user.id}) redeemed coupon code ${code}`);
                    } else {
                        const embed = new discord.EmbedBuilder()
                            .setTitle("❌ Redemption Failed")
                            .setDescription(
                                "The coupon code could not be redeemed. This may be because:\n\n" +
                                "• The code is invalid or has been used\n" +
                                "• The code has expired\n" +
                                "• There was a database error\n\n" +
                                "Please check the code and try again, or contact support if the issue persists."
                            )
                            .setColor(client.config.embed.color.error)
                            .setTimestamp();

                        await interaction.editReply({ embeds: [embed] });
                    }
                    break;
                }

                case "remove": {
                    if (!client.config.bot.owners.includes(interaction.user.id)) {
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).error("❌ This subcommand is restricted to bot owners only.")]
                        });
                    }

                    const targetUser = interaction.options.getUser("user", true);
                    const [isPremium, _] = await premiumHandler.checkPremiumStatus(targetUser.id);

                    if (!isPremium) {
                        return interaction.editReply({
                            embeds: [new EmbedTemplate(client).warning(`⚠️ ${targetUser.tag} doesn't have premium status.`)]
                        });
                    }

                    const success = await premiumHandler.revokePremium(targetUser.id);

                    if (success) {
                        const embed = new discord.EmbedBuilder()
                            .setTitle("✅ Premium Removed")
                            .setDescription(`Successfully removed premium status from **${targetUser.tag}**.`)
                            .setColor(client.config.embed.color.success)
                            .setTimestamp();

                        await interaction.editReply({ embeds: [embed] });

                        client.logger.info(`[PREMIUM] ${interaction.user.tag} (${interaction.user.id}) removed premium from ${targetUser.tag} (${targetUser.id})`);
                    } else {
                        await interaction.editReply({
                            embeds: [new EmbedTemplate(client).error(`❌ Failed to remove premium status from ${targetUser.tag}. Database operation failed.`)]
                        });
                    }
                    break;
                }

                default:
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("❌ Invalid subcommand")]
                    });
            }
        } catch (error) {
            client.logger.error(`[PREMIUM] Error executing premium command: ${error}`);
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("❌ An error occurred while processing your request.")]
            });
        }
    }
};

export default premiumCommand;