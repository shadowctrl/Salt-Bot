import client from "../salt";
import discord from "discord.js";
import timers from "timers/promises";

/**
 * A utility function to wait for a specified amount of time.
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the specified time.
 */
const wait = async (ms: number): Promise<void> => {
    await timers.setTimeout(ms);
};

/**
 * Sends a temporary message and deletes both the original and response messages after a specified duration.
 * @param message - The original message that triggered this response.
 * @param channel - Optional text channel to send the message to. If null, replies to the original message.
 * @param embed - The embed object to send.
 * @param components - Optional ActionRowBuilder to add interactive components to the message.
 * @param duration - Duration in milliseconds before deletion (default: 10000ms).
 * @returns A promise that resolves when the process completes.
 */
const sendTempMessage = async (
    message: discord.Message,
    channel: discord.TextChannel | null,
    embed: discord.EmbedBuilder,
    components: discord.ActionRowBuilder<discord.AnyComponentBuilder> | null = null,
    duration: number = 10000
): Promise<void> => {
    const handleError = (error: any, context: string): null => {
        // Ignore common expected errors
        if (error.code === 50007 || error.code === 50001) return null;
        client.logger.error(`[TEMP_MESSAGE] Error ${context}: ${error}`);
        return null;
    };

    // Prepare message options
    const messageOptions: discord.MessageCreateOptions = { embeds: [embed] };
    if (components) messageOptions.components = [components as unknown as discord.APIActionRowComponent<discord.APIMessageActionRowComponent>];

    // Send the message to specified channel or as a reply
    const msg = channel?.isTextBased()
        ? await channel.send(messageOptions).catch(e => handleError(e, "sending to channel"))
        : await message.reply(messageOptions).catch(e => handleError(e, "replying to message"));

    if (!msg) return;

    // Wait for the specified duration
    await wait(duration);

    // Try to delete both messages
    try {
        await message.delete().catch(e => handleError(e, "deleting original message"));
        await msg.delete().catch(e => handleError(e, "deleting response message"));
        client.logger.debug(`[TEMP_MESSAGE] Deleted messages after ${duration}ms`);
    } catch (error) {
        handleError(error, "in deletion process");
    }
};

export { wait, sendTempMessage };