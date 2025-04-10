import ms from "ms";
import discord from "discord.js";
import client from "../../../salt";
import PremiumHandler from "../../../utils/premium_handler";
import { EmbedTemplate, ButtonTemplate } from "../../../utils/embed_template";
import { BlockedUserRepository } from "../../database/repo/blocked_users";
import { BotEvent, SlashCommand } from "../../../types";


const cooldown: discord.Collection<string, number> = new discord.Collection();

const checkBlockedStatus = async (userId: string): Promise<[boolean, string | null]> => {
    try {
        const blockedUserRepo = new BlockedUserRepository((client as any).dataSource);

        // Use the new method to get the most recent block reason
        const [isBlocked, recentReason] = await blockedUserRepo.checkBlockStatus(userId);

        if (isBlocked && recentReason) {
            return [true, recentReason.reason];
        }

        return [isBlocked, null];
    } catch (error: Error | any) {
        client.logger.error(`[CHECK_BLOCKED] Error checking blocked status: ${error}`);
        return [false, null];
    }
};

const checkPremiumStatus = async (userId: string): Promise<[boolean, Date | null]> => {
    try {
        const premiumHandler = new PremiumHandler((client as any).dataSource);

        const [isPremium, premiumExpire] = await premiumHandler.checkPremiumStatus(userId);

        if (isPremium && premiumExpire && new Date(premiumExpire) < new Date()) {
            await premiumHandler.revokePremium(userId);
            client.logger.info(`[PREMIUM] User ${userId} premium expired. Revoked.`);
            return [false, null];
        }

        return [isPremium, premiumExpire];
    } catch (error: Error | any) {
        client.logger.error(`[CHECK_PREMIUM] Error checking premium status: ${error}`);
        return [false, null];
    }
};

const handleCommandPrerequisites = async (
    client: discord.Client,
    interaction: discord.Interaction,
    command: SlashCommand
): Promise<boolean> => {
    if (!interaction.isChatInputCommand()) return false;

    try {
        // Check if user is blocked using the updated method
        const [isBlocked, blockReason] = await checkBlockedStatus(interaction.user.id);

        if (isBlocked) {
            if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                const reasonText = blockReason
                    ? `Reason: ${blockReason}`
                    : 'No specific reason provided';

                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error(`🚫 You are blocked from using this bot. \n**${reasonText}**`).setFooter({ text: "Join Salt support server and raise ticket for unblock." })],
                    components: [new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(new ButtonTemplate(client).supportButton())],
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
                    if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                        await interaction.reply({
                            embeds: [new EmbedTemplate(client).warning(coolMsg)],
                            flags: discord.MessageFlags.Ephemeral,
                        });
                    }
                    return false;
                }
            }
        }

        if (command.premium) {
            const [isPremium, _] = await checkPremiumStatus(interaction.user.id);
            if (!isPremium) {
                if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("🚫 This command is available to premium users only.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
                return false;
            }
        }

        if (command.owner && !client.config.bot.owners.includes(interaction.user.id)) {
            if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
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
                if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
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
                if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("🚫 I do not have permission to execute this command.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
                return false;
            }
        }

        return true;
    } catch (error) {
        client.logger.error(`[CMD_PREREQ] Error in command prerequisites: ${error}`);

        if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error("An error occurred while processing your command.")],
                flags: discord.MessageFlags.Ephemeral,
            });
        }

        return false;
    }
};

const executeCommand = async (
    client: discord.Client,
    interaction: discord.Interaction,
    command: SlashCommand
): Promise<void> => {
    if (!interaction.isChatInputCommand()) return;

    try {
        // Execute the command
        await command.execute(interaction, client);

        // Log the command execution
        await client.cmdLogger.log({
            client,
            commandName: `/${interaction.commandName}`,
            guild: interaction.guild,
            user: interaction.user,
            channel: interaction.channel as discord.TextChannel | null,
        });

        // Set cooldown if applicable
        if (command.cooldown) {
            if (client.config.bot.owners.includes(interaction.user.id)) return;
            const cooldownKey = `${command.data.name}${interaction.user.id}`;
            const cooldownAmount = command.cooldown * 1000;

            cooldown.set(cooldownKey, Date.now() + cooldownAmount);
            setTimeout(() => cooldown.delete(cooldownKey), cooldownAmount);
        }
    } catch (error) {
        client.logger.error(`[INTERACTION_CREATE] Error executing command ${command.data.name}: ${error}`);

        try {
            // Check if we can still reply
            if (interaction.isRepliable()) {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("🚫 An error occurred while executing the command.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                } else if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({
                        embeds: [new EmbedTemplate(client).error("🚫 An error occurred while executing the command.")]
                    });
                }
            }
        } catch (replyError) {
            client.logger.error(`[INTERACTION_CREATE] Failed to send error response: ${replyError}`);
        }
    }
};

const event: BotEvent = {
    name: discord.Events.InteractionCreate,
    execute: async (interaction: discord.Interaction, client: discord.Client): Promise<void> => {
        try {
            // Handle autocomplete interactions
            if (interaction.isAutocomplete()) {
                const command = client.slashCommands.get(interaction.commandName);
                if (command?.autocomplete) {
                    try {
                        await command.autocomplete(interaction, client);
                    } catch (error) {
                        client.logger.warn(`[INTERACTION_CREATE] Autocomplete error: ${error}`);
                    }
                }
                return;
            }

            // Only process chat input commands
            if (!interaction.isChatInputCommand()) return;

            const command = client.slashCommands.get(interaction.commandName);
            if (!command) {
                client.logger.warn(`[INTERACTION_CREATE] Command ${interaction.commandName} not found.`);
                return;
            }

            // Check prerequisites and execute command
            if (await handleCommandPrerequisites(client, interaction, command)) {
                await executeCommand(client, interaction, command);
            }
        } catch (error) {
            client.logger.error(`[INTERACTION_CREATE] Error processing interaction command: ${error}`);

            try {
                // Last resort error handling
                if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                    await interaction.reply({
                        embeds: [new EmbedTemplate(client).error("🚫 An unexpected error occurred while processing the command.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
            } catch (replyError) {
                client.logger.error(`[INTERACTION_CREATE] Failed to send error response: ${replyError}`);
            }
        }
    }
};

export default event;