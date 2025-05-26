import discord from "discord.js";
import client from "../salt";
import { Ticket } from "./ticket";

/**
 * Creates a new ticket for a user
 * 
 * @param interaction - The interaction that triggered the ticket creation
 * @param categoryId - The ID of the ticket category
 * @returns A promise that resolves when the ticket is created
 */
export const createTicket = async (
    interaction: discord.ButtonInteraction | discord.StringSelectMenuInteraction,
    categoryId: string
): Promise<void> => {
    try {
        const dataSource = (client as any).dataSource;
        if (!dataSource) {
            throw new Error("Database connection not available");
        }

        const ticketManager = new Ticket(dataSource, client);

        const result = await ticketManager.create({
            guildId: interaction.guildId!,
            userId: interaction.user.id,
            categoryId: categoryId,
            initialMessage: undefined
        });

        if (result.success) {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("✅ Ticket Created Successfully")
                        .setDescription(result.message)
                        .setColor("Green")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error Creating Ticket")
                        .setDescription(result.message)
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        client.logger.error(`[TICKET_CREATE] Error creating ticket: ${error}`);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error Creating Ticket")
                        .setDescription("An error occurred while creating your ticket. Please try again later.")
                        .setColor("Red")
                ],
                flags: discord.MessageFlags.Ephemeral
            });
        } else {
            await interaction.editReply({
                embeds: [
                    new discord.EmbedBuilder()
                        .setTitle("❌ Error Creating Ticket")
                        .setDescription("An error occurred while creating your ticket. Please try again later.")
                        .setColor("Red")
                ]
            });
        }
    }
};