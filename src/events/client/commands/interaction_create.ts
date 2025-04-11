import ms from "ms";
import discord from "discord.js";
import { EmbedTemplate, ButtonTemplate } from "../../../utils/embed_template";
import { checkBlockedStatus, checkPremiumStatus } from "../../../utils/commands";
import { BotEvent, SlashCommand } from "../../../types";

const cooldown: discord.Collection<string, number> = new discord.Collection();

const handleCommandPrerequisites = async (
    client: discord.Client,
    interaction: discord.Interaction,
    command: SlashCommand
): Promise<boolean> => {
    if (!interaction.isChatInputCommand()) return false;

    try {
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
                        embeds: [new EmbedTemplate(client).error("❌ This command is available to premium users only.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
                return false;
            }
        }

        if (command.owner && !client.config.bot.owners.includes(interaction.user.id)) {
            if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                await interaction.reply({
                    embeds: [new EmbedTemplate(client).error("❌ This command is restricted to bot owners only.")],
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
                        embeds: [new EmbedTemplate(client).error("❌ You do not have permission to use this command.")],
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
                        embeds: [new EmbedTemplate(client).error("❌ I do not have permission to execute this command.")],
                        flags: discord.MessageFlags.Ephemeral,
                    });
                }
                return false;
            }
        }

        return true;
    } catch (error) {
        client.logger.error(`[INTERACTION_CREATE] Error in command prerequisites: ${error}`);

        if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
            await interaction.reply({
                embeds: [new EmbedTemplate(client).error("❌ An error occurred while checking command prerequisites.")],
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
        await command.execute(interaction, client);

        await client.cmdLogger.log({
            client,
            commandName: `/${interaction.commandName}`,
            guild: interaction.guild,
            user: interaction.user,
            channel: interaction.channel as discord.TextChannel | null,
        });

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

            if (!interaction.isChatInputCommand()) return;

            const command = client.slashCommands.get(interaction.commandName);
            if (!command) {
                client.logger.warn(`[INTERACTION_CREATE] Command ${interaction.commandName} not found.`);
                return;
            }

            if (!(client as any).dataSource) {
                if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                    await interaction.reply({
                        embeds: [
                            new EmbedTemplate(client).error("❌ Database connection is not available.")
                        ]
                    });
                } else if (interaction.isRepliable() && interaction.deferred && !interaction.replied) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedTemplate(client).error("❌ Database connection is not available.")
                        ]
                    });
                } else {
                    client.logger.error("[INTERACTION_CREATE] Database connection is not available.");
                }
                return;
            }

            if (await handleCommandPrerequisites(client, interaction, command)) {
                await executeCommand(client, interaction, command);
            }
        } catch (error) {
            client.logger.error(`[INTERACTION_CREATE] Error processing interaction command: ${error}`);

            try {
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