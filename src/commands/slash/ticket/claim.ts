import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

export const claimTicket = async (
    interaction: discord.ChatInputCommandInteraction,
    client: discord.Client
): Promise<void> => {
    await interaction.deferReply();

    try {
        const ticketRepo = new TicketRepository((client as any).dataSource);
        const ticket = await ticketRepo.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("This command can only be used in a ticket channel.")]
            });
            return;
        }

        if (ticket.claimedById) {
            if (ticket.claimedById === interaction.user.id) {
                await ticketRepo.unclaimTicket(ticket.id);

                const unclaimEmbed = new discord.EmbedBuilder()
                    .setTitle("Ticket Unclaimed")
                    .setDescription(`This ticket is no longer being handled by <@${interaction.user.id}>.`)
                    .setColor("Orange")
                    .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
                    .setTimestamp();

                const channel = interaction.channel as discord.TextChannel;
                await channel.send({ embeds: [unclaimEmbed] });

                try {
                    const messages = await channel.messages.fetch({ limit: 10 });
                    let buttonMessage: discord.Message | undefined;

                    messages.forEach(msg => {
                        if (msg.author.id === client.user?.id && msg.components.length > 0) {
                            let hasTicketButtons = false;

                            msg.components.forEach(row => {
                                const actionRow = row as discord.ActionRow<discord.MessageActionRowComponent>;
                                actionRow.components.forEach(component => {
                                    if (component.type === discord.ComponentType.Button) {
                                        const button = component as discord.ButtonComponent;
                                        if (button.customId === "ticket_claim" || button.customId === "ticket_close") {
                                            hasTicketButtons = true;
                                        }
                                    }
                                });
                            });

                            if (hasTicketButtons) {
                                buttonMessage = msg;
                            }
                        }
                    });

                    if (buttonMessage) {
                        const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                            .addComponents(
                                new discord.ButtonBuilder()
                                    .setCustomId("ticket_claim")
                                    .setLabel("Claim Ticket")
                                    .setStyle(discord.ButtonStyle.Primary)
                                    .setEmoji("👋"),
                                new discord.ButtonBuilder()
                                    .setCustomId("ticket_close")
                                    .setLabel("Close Ticket")
                                    .setStyle(discord.ButtonStyle.Danger)
                                    .setEmoji("🔒")
                            );

                        await buttonMessage.edit({ components: [actionRow] }).catch(err => {
                            client.logger.warn(`[TICKET_CLAIM] Could not update message: ${err}`);
                        });
                    }
                } catch (err) {
                    client.logger.warn(`[TICKET_CLAIM] Could not find or update message with buttons: ${err}`);
                }

                await interaction.editReply({
                    embeds: [new EmbedTemplate(client).success("You have successfully unclaimed this ticket.")]
                });

                client.logger.info(`[TICKET_CLAIM] ${interaction.user.tag} unclaimed ticket #${ticket.ticketNumber}`);
                return;
            }

            const claimer = await client.users.fetch(ticket.claimedById).catch(() => null);
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error(
                        `This ticket is already claimed by ${claimer ? `<@${claimer.id}>` : "someone else"}.`
                    )
                ]
            });
            return;
        }

        const member = interaction.member as discord.GuildMember;
        const supportRoleId = ticket.category.supportRoleId;
        const hasPermission =
            member.permissions.has(discord.PermissionFlagsBits.ManageChannels) ||
            (supportRoleId && member.roles.cache.has(supportRoleId));

        if (!hasPermission) {
            await interaction.editReply({
                embeds: [
                    new EmbedTemplate(client).error(
                        "You don't have permission to claim tickets. Only support team members can claim tickets."
                    )
                ]
            });
            return;
        }

        await ticketRepo.claimTicket(ticket.id, interaction.user.id);

        const claimEmbed = new discord.EmbedBuilder()
            .setTitle("Ticket Claimed")
            .setDescription(`This ticket is now being handled by <@${interaction.user.id}>.`)
            .addFields(
                { name: "Claimed By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Claimed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setColor("Blue")
            .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
            .setTimestamp();

        const channel = interaction.channel as discord.TextChannel;
        await channel.send({ embeds: [claimEmbed] });

        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            let buttonMessage: discord.Message | undefined;

            messages.forEach(msg => {
                if (msg.author.id === client.user?.id && msg.components.length > 0) {
                    let hasTicketButtons = false;

                    msg.components.forEach(row => {
                        const actionRow = row as discord.ActionRow<discord.MessageActionRowComponent>;
                        actionRow.components.forEach(component => {
                            if (component.type === discord.ComponentType.Button) {
                                const button = component as discord.ButtonComponent;
                                if (button.customId === "ticket_claim" || button.customId === "ticket_close") {
                                    hasTicketButtons = true;
                                }
                            }
                        });
                    });

                    if (hasTicketButtons) {
                        buttonMessage = msg;
                    }
                }
            });

            if (buttonMessage) {
                const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>()
                    .addComponents(
                        new discord.ButtonBuilder()
                            .setCustomId("ticket_claim")
                            .setLabel("Unclaim Ticket")
                            .setStyle(discord.ButtonStyle.Secondary)
                            .setEmoji("🔄"),
                        new discord.ButtonBuilder()
                            .setCustomId("ticket_close")
                            .setLabel("Close Ticket")
                            .setStyle(discord.ButtonStyle.Danger)
                            .setEmoji("🔒")
                    );

                await buttonMessage.edit({ components: [actionRow] }).catch(err => {
                    client.logger.warn(`[TICKET_CLAIM] Could not update message: ${err}`);
                });
            }
        } catch (err) {
            client.logger.warn(`[TICKET_CLAIM] Could not find or update message with buttons: ${err}`);
        }

        await interaction.editReply({
            embeds: [
                new EmbedTemplate(client).success(
                    "You have successfully claimed this ticket. You are now responsible for handling this support request."
                )
            ]
        });

        client.logger.info(`[TICKET_CLAIM] ${interaction.user.tag} claimed ticket #${ticket.ticketNumber}`);
    } catch (error) {
        client.logger.error(`[TICKET_CLAIM] Error claiming ticket: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while claiming the ticket.")]
        });
    }
};