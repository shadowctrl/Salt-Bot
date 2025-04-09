import discord from "discord.js";
import { SlashCommand } from "../../types";
import { BlockedUserRepository } from "../../events/database/repo/blocked_users";

const blockCommand: SlashCommand = {
    data: new discord.SlashCommandBuilder()
        .setName("block")
        .setDescription("Block a user from using the bot")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to block")
                .setRequired(true))
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("The reason for blocking the user")
                .setRequired(true)),
    cooldown: 5,
    owner: true,
    execute: async (
        interaction: discord.ChatInputCommandInteraction,
        client: discord.Client
    ) => {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        if (!user || !reason) {
            return interaction.reply({
                content: "Please provide a valid user and reason",
                flags: discord.MessageFlags.Ephemeral
            });
        }

        try {
            // Get repository from the client's dataSource
            const blockedUserRepo = new BlockedUserRepository((client as any).dataSource);

            // Block the user
            await blockedUserRepo.blockUser(user.id, reason);

            return interaction.reply({
                content: `Successfully blocked ${user.tag} for reason: ${reason}`,
                flags: discord.MessageFlags.Ephemeral
            });
        } catch (error) {
            client.logger.error(`[BLOCK] Error blocking user: ${error}`);
            return interaction.reply({
                content: "An error occurred while blocking the user",
                flags: discord.MessageFlags.Ephemeral
            });
        }
    }
};

export default blockCommand;