import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { Ticket } from "../../../utils/ticket";

export const closeTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        const ticketManager = new Ticket((client as any).dataSource, client);
        const reason = interaction.options.getString("reason") || "No reason provided";

        const result = await ticketManager.close({
            channelId: interaction.channelId,
            userId: interaction.user.id,
            reason: reason,
            generateTranscript: true
        });

        if (result.success) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).success(result.message)]
            });
        } else {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error(result.message)]
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CLOSE] Error closing ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while closing the ticket.")]
        });
    }
};