import ms from "ms";
import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { BlockedUserRepository } from "../../database/repo/blocked_users";
import { BotEvent, IBlockReason, SlashCommand } from "../../../types";
import client from "../../../salt";

const cooldown: discord.Collection<string, number> = new discord.Collection();

const checkBlockedStatus = async (userId: string): Promise<[boolean, IBlockReason]> => {
    const blockedUserRepo = new BlockedUserRepository((client as any).dataSource);
    const data = await blockedUserRepo.findByUserId(userId);
    if (!data) {
        return [false, { id: userId, reason: "No reason provided", timestamp: new Date() }];
    }
    return [data.status, data.data[0]];
}

const handleCommandPrerequisites = async (
    client: discord.Client,
    interaction: discord.Interaction,
    command: SlashCommand
) => {
    if (!interaction.isChatInputCommand()) return false;

    const [isBlocked, blockReason] = await checkBlockedStatus(interaction.user.id);
    if (isBlocked) {
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error(`🚫 You are blocked from using this bot. Reason: ${blockReason.reason}`)],
                flags: discord.MessageFlags.Ephemeral,
            });
        }
        return false;
    }

    if (command.cooldown) {
        const cooldownKey = `${command.data.name}${interaction.user.id}`;
        if (cooldown.has(cooldownKey)) {
            const cooldownTime = cooldown.get(cooldownKey);
            const remainingTime = cooldownTime ? cooldownTime - Date.now() : 0;

            const coolMsg = client.config.bot.command.cooldown_message.replace(
                "<duration>",
                ms(remainingTime)
            );

            if (remainingTime > 0) {
                if (interaction.isRepliable() && !interaction.replied) {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).warning(coolMsg)],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
                return false;
            }
        }
    }

    if (command.owner && !client.config.bot.owners.includes(interaction.user.id)) {
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error("🚫 This command is restricted to bot owners only.")],
                flags: discord.MessageFlags.Ephemeral,
            });
        }
        return false;
    }

    if (command.userPerms && interaction.guild) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has(command.userPerms)) {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("🚫 You do not have permission to use this command.")],
                    flags: discord.MessageFlags.Ephemeral,
                });
            }
            return false;
        }
    }

    if (command.botPerms && interaction.guild) {
        const member = await interaction.guild.members.fetch(client.user?.id || "");
        if (!member.permissions.has(command.botPerms)) {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("🚫 I do not have permission to execute this command.")],
                    flags: discord.MessageFlags.Ephemeral,
                });
            }
            return false;
        }
    }

    return true;
};

const executeCommand = async (
    client: discord.Client,
    interaction: discord.Interaction,
    command: SlashCommand
): Promise<void> => {
    if (!interaction.isChatInputCommand()) return;

    try {
        await command.execute(interaction, client);

        await client.cmdLogger.log({
            client,
            commandName: `/${interaction.commandName}`,
            guild: interaction.guild,
            user: interaction.user,
            channel: interaction.channel,
        });

        if (command.cooldown) {
            if (client.config.bot.owners.includes(interaction.user.id)) return;
            const cooldownKey = `${command.data.name}${interaction.user.id}`;
            const cooldownAmount = command.cooldown * 1000;

            cooldown.set(cooldownKey, Date.now() + cooldownAmount);
            setTimeout(() => cooldown.delete(cooldownKey), cooldownAmount);
        }

    } catch (error: Error | any) {
        client.logger.error(`[INTERACTION_CREATE] Error executing command ${command.data.name}: ${error}`);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error("🚫 An error occurred while executing the command.")],
                flags: discord.MessageFlags.Ephemeral,
            });
        }
    }
};

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        try {
            if (interaction.isAutocomplete()) {
                const command = client.slashCommands.get(interaction.commandName);
                if (command?.autocomplete) {
                    try {
                        command.autocomplete(interaction, client);
                    } catch (error) {
                        client.logger.warn(
                            `[INTERACTION_CREATE] Autocomplete error: ${error}`
                        );
                    }
                }
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            const command = client.slashCommands.get(interaction.commandName);
            if (!command) return client.logger.warn(`[INTERACTION_CREATE] Command ${interaction.commandName} not found.`);

            if (await handleCommandPrerequisites(client, interaction, command)) {
                await executeCommand(client, interaction, command);
            }
        } catch (error: Error | any) {
            client.logger.error(`[INTERACTION_CREATE] Error processing interaction command: ${error}`);
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("🚫 An error occurred while processing the command.")],
                    flags: discord.MessageFlags.Ephemeral,
                });
            }
        }
    }
};

export default event;