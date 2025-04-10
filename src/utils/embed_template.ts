import discord from "discord.js";

/**
 * EmbedTemplate class is used to create embed messages for Discord bot responses.
 * It provides methods to create success, error, warning, and info embeds with a consistent style.
 * @class EmbedTemplate
 */
class EmbedTemplate {
    private readonly client: discord.Client;

    constructor(client: discord.Client) {
        this.client = client;
    }

    /**
     * Creates a success embed message.
     * @param {string} message - The message to include in the embed.
     * @returns {discord.EmbedBuilder} - The created embed message.
     */
    public success(message: string): discord.EmbedBuilder {
        return new discord.EmbedBuilder()
            .setColor(this.client.config.embed.color.success)
            .setDescription(message)
            .setFooter({
                text: this.client.user?.username || "Ticket Bot",
                iconURL: this.client.user?.displayAvatarURL()
            })
            .setTimestamp();
    }

    /**
     * Creates an error embed message.
     * @param {string} message - The message to include in the embed.
     * @returns {discord.EmbedBuilder} - The created embed message.
     */
    public error(message: string): discord.EmbedBuilder {
        return new discord.EmbedBuilder()
            .setColor(this.client.config.embed.color.error)
            .setDescription(message)
            .setFooter({
                text: this.client.user?.username || "Ticket Bot",
                iconURL: this.client.user?.displayAvatarURL()
            })
            .setTimestamp();
    }

    /**
     * Creates a warning embed message.
     * @param {string} message - The message to include in the embed.
     * @returns {discord.EmbedBuilder} - The created embed message.
     */
    public warning(message: string): discord.EmbedBuilder {
        return new discord.EmbedBuilder()
            .setColor(this.client.config.embed.color.warning)
            .setDescription(message)
            .setFooter({
                text: this.client.user?.username || "Ticket Bot",
                iconURL: this.client.user?.displayAvatarURL()
            })
            .setTimestamp();
    }

    /**
     * Creates an info embed message.
     * @param {string} message - The message to include in the embed.
     * @returns {discord.EmbedBuilder} - The created embed message.
     */
    public info(message: string): discord.EmbedBuilder {
        return new discord.EmbedBuilder()
            .setColor(this.client.config.embed.color.default)
            .setDescription(message)
            .setFooter({
                text: this.client.user?.username || "Ticket Bot",
                iconURL: this.client.user?.displayAvatarURL()
            })
            .setTimestamp();
    }
};

/**
 * ButtonTemplate class is used to create buttons for Discord bot responses.
 * It provides methods to create buttons with specific styles and actions.
 * @class ButtonTemplate
 */
class ButtonTemplate {
    private readonly client: discord.Client;

    constructor(client: discord.Client) {
        this.client = client;
    }

    /**
     * Creates a support button.
     * @returns {discord.ButtonBuilder} - The created button.
     */
    public supportButton(): discord.ButtonBuilder {
        return new discord.ButtonBuilder()
            .setLabel(`${this.client.user?.username} Support`)
            .setEmoji("🛠️")
            .setStyle(discord.ButtonStyle.Link)
            .setURL(this.client.config.bot.support.link);
    }
};

export { EmbedTemplate, ButtonTemplate };