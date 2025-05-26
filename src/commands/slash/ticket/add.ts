import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { Ticket } from "../../../utils/ticket";

export const addUserToTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        const ticketManager = new Ticket((client as any).dataSource, client);
        const userToAdd = interaction.options.getUser("user");

        if (!userToAdd) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Please specify a valid user to add.")]
            });
            return;
        }

        const result = await ticketManager.addUser(
            interaction.channelId,
            userToAdd.id,
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
        client.logger.error(`[TICKET_ADD] Error adding user to ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while adding the user to the ticket.")]
        });
    }
};