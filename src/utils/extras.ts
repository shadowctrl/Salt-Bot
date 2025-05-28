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
    const handleError = (error: any, context: string): null => {
        const ignoredErrors = [
            'Unknown Message',
            'MESSAGE_REFERENCE_UNKNOWN_MESSAGE',
            'Unknown Channel',
            '50035'
        ];

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

    const messageOptions: discord.MessageCreateOptions = { embeds: [embed] };
    if (components) messageOptions.components = [components.toJSON()];

    let msg: discord.Message | null = null;

    try {
        const targetChannel = channel?.isTextBased()
            ? channel
            : message.channel?.isTextBased()
                ? message.channel
                : null;

        if (!targetChannel) {
            client.logger.debug(`[TEMP_MESSAGE] No valid channel found to send message`);
            return null;
        }

        if ('send' in targetChannel) {
            msg = await targetChannel.send(messageOptions)
                .catch(e => handleError(e, "sending to channel"));
        } else {
            client.logger.debug(`[TEMP_MESSAGE] Channel doesn't support send method`);
        }

        if (!msg) {
            try {
                const messageExists = await message.fetch().catch(() => null);

                if (messageExists) {
                    msg = await message.reply(messageOptions)
                        .catch(e => handleError(e, "replying to message"));
                }
            } catch (error) {
                handleError(error, "checking if message exists");
            }
        }

        if (!msg) {
            return null;
        }

        await wait(duration);

        try {
            await msg.delete().catch(e => handleError(e, "deleting response message"));
            client.logger.debug(`[TEMP_MESSAGE] Deleted message after ${duration}ms`);
        } catch (error) {
            handleError(error, "in deletion process");
        }

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
    const MAX_TIMEOUT = 2147483647;

    if (delayMs <= MAX_TIMEOUT) {
        return setTimeout(callback, delayMs);
    } else {
        return setTimeout(() => {
            setSafeTimeout(callback, delayMs - MAX_TIMEOUT);
        }, MAX_TIMEOUT);
    }
};

/**
 * Validates and formats color input for embeds
 * @param color - Color input from user
 * @returns Formatted color string or null if invalid
 */
const validateAndFormatColor = (color: string): string | null => {
    const trimmedColor = color.trim();
    const hexRegex = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(trimmedColor)) {
        return trimmedColor.startsWith('#') ? trimmedColor : `#${trimmedColor}`;
    }

    const discordColors: Record<string, string> = {
        'default': '#000000',
        'white': '#FFFFFF',
        'aqua': '#1ABC9C',
        'green': '#57F287',
        'blue': '#3498DB',
        'yellow': '#FEE75C',
        'purple': '#9B59B6',
        'luminous_vivid_pink': '#E91E63',
        'fuchsia': '#EB459E',
        'gold': '#F1C40F',
        'orange': '#E67E22',
        'red': '#ED4245',
        'grey': '#95A5A6',
        'navy': '#34495E',
        'dark_aqua': '#11806A',
        'dark_green': '#1F8B4C',
        'dark_blue': '#206694',
        'dark_purple': '#71368A',
        'dark_vivid_pink': '#AD1457',
        'dark_gold': '#C27C0E',
        'dark_orange': '#A84300',
        'dark_red': '#992D22',
        'dark_grey': '#979C9F',
        'darker_grey': '#7F8C8D',
        'light_grey': '#BCC0C0',
        'dark_navy': '#2C3E50',
        'blurple': '#5865F2',
        'greyple': '#99AAB5',
        'dark_but_not_black': '#2C2F33',
        'not_quite_black': '#23272A'
    };

    const lowerColor = trimmedColor.toLowerCase();
    if (discordColors[lowerColor]) {
        return discordColors[lowerColor];
    }

    return null;
};

/**
 * Validates and returns a safe color for Discord embeds
 * @param color - Color string to validate
 * @returns Valid color string or null if invalid
 */
const getValidColor = (color: string | undefined | null): string | null => {
    if (!color) return null;

    const hexRegex = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(color)) {
        return color.startsWith('#') ? color : `#${color}`;
    }

    const discordColors: Record<string, string> = {
        'default': '#000000',
        'white': '#FFFFFF',
        'aqua': '#1ABC9C',
        'green': '#57F287',
        'blue': '#3498DB',
        'yellow': '#FEE75C',
        'purple': '#9B59B6',
        'luminous_vivid_pink': '#E91E63',
        'fuchsia': '#EB459E',
        'gold': '#F1C40F',
        'orange': '#E67E22',
        'red': '#ED4245',
        'grey': '#95A5A6',
        'navy': '#34495E',
        'dark_aqua': '#11806A',
        'dark_green': '#1F8B4C',
        'dark_blue': '#206694',
        'dark_purple': '#71368A',
        'dark_vivid_pink': '#AD1457',
        'dark_gold': '#C27C0E',
        'dark_orange': '#A84300',
        'dark_red': '#992D22',
        'dark_grey': '#979C9F',
        'darker_grey': '#7F8C8D',
        'light_grey': '#BCC0C0',
        'dark_navy': '#2C3E50',
        'blurple': '#5865F2',
        'greyple': '#99AAB5',
        'dark_but_not_black': '#2C2F33',
        'not_quite_black': '#23272A'
    };

    const lowerColor = color.toLowerCase().replace(/[^a-z_]/g, '');
    return discordColors[lowerColor] || null;
};

export { wait, sendTempMessage, setSafeTimeout, validateAndFormatColor, getValidColor };