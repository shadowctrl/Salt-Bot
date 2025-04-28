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
 * Includes robust error handling for common Discord API errors.
 * @param message - The original message that triggered this response.
 * @param channel - Optional text channel to send the message to. If null, attempts to send in the original message's channel.
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
): Promise<discord.Message | null> => {
    // Error handling helper that ignores expected errors
    const handleError = (error: any, context: string): null => {
        // Ignore common expected errors
        const ignoredErrors = [
            'Unknown Message',
            'MESSAGE_REFERENCE_UNKNOWN_MESSAGE',
            'Unknown Channel',
            '50035'  // Invalid Form Body error code
        ];

        // Check if this is an error we should ignore in logs
        const shouldIgnore = ignoredErrors.some(errText =>
            error.message?.includes(errText) ||
            error.code?.toString() === errText
        );

        if (!shouldIgnore) {
            client.logger.error(`[TEMP_MESSAGE] Error ${context}: ${error}`);
        } else {
            client.logger.debug(`[TEMP_MESSAGE] Ignored expected error ${context}: ${error.code || error.message}`);
        }

        return null;
    };

    // Prepare message options
    const messageOptions: discord.MessageCreateOptions = { embeds: [embed] };
    if (components) messageOptions.components = [components.toJSON()];

    let msg: discord.Message | null = null;

    try {
        // First, attempt to get the target channel
        const targetChannel = channel?.isTextBased()
            ? channel
            : message.channel?.isTextBased()
                ? message.channel
                : null;

        if (!targetChannel) {
            client.logger.debug(`[TEMP_MESSAGE] No valid channel found to send message`);
            return null;
        }

        // Try to send as a normal message in the channel instead of a reply
        // Ensure we only use send on TextBasedChannel types
        if ('send' in targetChannel) {
            msg = await targetChannel.send(messageOptions)
                .catch(e => handleError(e, "sending to channel"));
        } else {
            client.logger.debug(`[TEMP_MESSAGE] Channel doesn't support send method`);
        }

        if (!msg) {
            // If channel send fails, fallback to reply only if message still exists
            try {
                // Check if message still exists by attempting to fetch it
                const messageExists = await message.fetch().catch(() => null);

                if (messageExists) {
                    msg = await message.reply(messageOptions)
                        .catch(e => handleError(e, "replying to message"));
                }
            } catch (error) {
                // Ignore any errors in this fallback logic
                handleError(error, "checking if message exists");
            }
        }

        if (!msg) {
            return null;
        }

        // Wait for the specified duration
        await wait(duration);

        // Delete the temporary message
        try {
            await msg.delete().catch(e => handleError(e, "deleting response message"));
            client.logger.debug(`[TEMP_MESSAGE] Deleted message after ${duration}ms`);
        } catch (error) {
            handleError(error, "in deletion process");
        }

        // Try to delete the original message if it still exists
        try {
            await message.delete().catch(e => handleError(e, "deleting original message"));
        } catch (error) {
            handleError(error, "in original message deletion");
        }

        return msg;
    } catch (error) {
        handleError(error, "in overall send process");
        return null;
    }
};

/**
 * Sets a timeout that safely handles durations longer than the maximum safe integer
 * 
 * @param callback - Function to execute after timeout
 * @param delayMs - Delay in milliseconds
 * @returns Timeout ID that can be used with clearTimeout
 */
const setSafeTimeout = (callback: () => void, delayMs: number): NodeJS.Timeout => {
    // Maximum timeout value (just under 2^31 - 1)
    const MAX_TIMEOUT = 2147483647;

    if (delayMs <= MAX_TIMEOUT) {
        // If the delay is within safe range, use setTimeout directly
        return setTimeout(callback, delayMs);
    } else {
        // For longer delays, chain timeouts
        return setTimeout(() => {
            setSafeTimeout(callback, delayMs - MAX_TIMEOUT);
        }, MAX_TIMEOUT);
    }
};

export { wait, sendTempMessage, setSafeTimeout };