import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { Ticket } from "../../../utils/ticket";

export const claimTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        const ticketManager = new Ticket((client as any).dataSource, client);

        const result = await ticketManager.claim(
            interaction.channelId,
            interaction.user.id
        );

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
        client.logger.error(`[TICKET_CLAIM] Error claiming ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while claiming the ticket.")]
        });
    }
};