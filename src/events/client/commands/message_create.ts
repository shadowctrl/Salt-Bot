import ms from "ms";
import discord from "discord.js";
import { sendTempMessage } from "../../../utils/extras";
import { EmbedTemplate, ButtonTemplate } from "../../../utils/embed_template";
import { checkBlockedStatus, checkPremiumStatus } from "../../../utils/commands";
import { BotEvent, Command } from "../../../types";

const cooldown: discord.Collection<string, number> = new discord.Collection();

const handleCommandPrerequisites = async (
    client: discord.Client,
    message: discord.Message,
    command: Command
): Promise<boolean> => {
    try {
        const [isBlocked, blockReason] = await checkBlockedStatus(message.author.id);

        if (isBlocked) {
            const reasonText = blockReason
                ? `Reason: ${blockReason}`
                : 'No specific reason provided';

            const embed = new EmbedTemplate(client).error(`🚫 You are blocked from using this bot. \n**${reasonText}**`).setFooter({ text: "Join Salt support server and raise ticket for unblock." })
            const components = new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(new ButtonTemplate(client).supportButton())
            await sendTempMessage(message, null, embed, components, 10000);
            return false;
        }

        if (command.cooldown) {
            const cooldownKey = `${command.name}${message.author.id}`;
            if (cooldown.has(cooldownKey)) {
                const cooldownTime = cooldown.get(cooldownKey);
                const remainingTime = cooldownTime ? cooldownTime - Date.now() : 0;

                const coolMsg = client.config.bot.command.cooldown_message.replace(
                    "<duration>",
                    ms(remainingTime)
                );

                await sendTempMessage(message, null, new EmbedTemplate(client).warning(coolMsg), null, 10000);
                return false;
            }
        }

        if (command.premium) {
            const [isPremium, _] = await checkPremiumStatus(message.author.id);
            if (!isPremium) {
                await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ This command is only available to premium users."), null, 10000);
                return false;
            }
        }

        if (command.owner && !client.config.bot.owners.includes(message.author.id)) {
            await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ This command is only available to bot owners."), null, 10000);
            return false;
        }

        if (command.userPerms && message.guild) {
            const member = await message.guild.members.fetch(message.author.id);
            if (!member.permissions.has(command.userPerms)) {
                await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ You do not have permission to use this command."), null, 10000);
                return false;
            }
        }

        if (command.botPerms && message.guild) {
            const member = await message.guild.members.fetch(client.user?.id || "");
            if (!member.permissions.has(command.botPerms)) {
                await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ I do not have permission to execute this command."), null, 10000);
                return false;
            }
        }

        return true;
    } catch (error: Error | any) {
        client.logger.error(`[MESSAGE_CREATE] Error in command prerequisites: ${error}`);
        await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ An error occurred while checking command prerequisites."), null, 10000);
        return false;
    }
};

const executeCommand = async (
    client: discord.Client,
    message: discord.Message,
    command: Command,
    args: string[]
): Promise<void> => {
    try {
        await command.execute(client, message, args);

        await client.cmdLogger.log({
            client,
            commandName: `${client.config.bot.command.prefix}${command.name}`,
            guild: message.guild,
            user: message.author,
            channel: message.channel,
        });

        if (command.cooldown) {
            if (client.config.bot.owners.includes(message.author.id)) return;
            const cooldownKey = `${command.name}${message.author.id}`;
            const cooldownAmount = command.cooldown * 1000;

            cooldown.set(cooldownKey, Date.now() + cooldownAmount);
            setTimeout(() => cooldown.delete(cooldownKey), cooldownAmount);
        }
    } catch (error: Error | any) {
        client.logger.error(`[MESSAGE_CREATE] Error executing command: ${error}`);
        await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ An error occurred while executing the command."), null, 10000);
    }
};

const event: BotEvent = {
    name: discord.Events.MessageCreate,
    execute: async (message: discord.Message, client: discord.Client): Promise<void> => {
        try {
            if (!message) return;
            if (message.author.bot) return;
            if (client.config.bot.command.disable_message) return;
            if (!message.content.startsWith(client.config.bot.command.prefix)) return;

            const args = message.content
                .slice(client.config.bot.command.prefix.length)
                .trim()
                .split(/ +/g);
            const commandName = args.shift()?.toLowerCase();
            if (!commandName || commandName.length === 0) return;

            let command = client.commands.get(commandName);
            if (!command && "aliases" in client) {
                const alias = (client as any).aliases.get(commandName);
                if (alias) {
                    command = client.commands.get(alias);
                }
            }

            if (!command) return;

            if (!(client as any).dataSource) {
                await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ Database connection is not available."), null, 10000);
            }

            if (await handleCommandPrerequisites(client, message, command)) {
                await executeCommand(client, message, command, args);
            }
        } catch (error: Error | any) {
            client.logger.error(`[MESSAGE_CREATE] Error in event handler: ${error}`);
            await sendTempMessage(message, null, new EmbedTemplate(client).error("❌ An error occurred while processing your message."), null, 10000);
        }
    }
};

export default event;