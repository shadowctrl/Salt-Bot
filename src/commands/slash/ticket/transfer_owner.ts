import discord from "discord.js";
import { EmbedTemplate } from "../../../utils/embed_template";
import { TicketRepository } from "../../../events/database/repo/ticket_system";

export const transferTicketOwner = async (
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

        const member = interaction.member as discord.GuildMember;
        const supportRoleId = ticket.category.supportRoleId;

        const hasPermission =
            member.permissions.has(discord.PermissionFlagsBits.Administrator) ||
            interaction.user.id === ticket.creatorId ||
            (supportRoleId && member.roles.cache.has(supportRoleId));

        if (!hasPermission) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You don't have permission to transfer ticket ownership. You need to be an administrator, the ticket creator, or have the support role.")]
            });
            return;
        }

        const newOwner = interaction.options.getUser("user");
        if (!newOwner) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Please specify a valid user to transfer ownership to.")]
            });
            return;
        }

        if (newOwner.bot) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("You cannot transfer ticket ownership to a bot.")]
            });
            return;
        }

        if (newOwner.id === ticket.creatorId) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).warning(`${newOwner} is already the ticket owner.`)]
            });
            return;
        }

        const previousOwner = await client.users.fetch(ticket.creatorId).catch(() => null);
        const updatedTicket = await ticketRepo.updateTicketOwner(ticket.id, newOwner.id);

        if (!updatedTicket) {
            await interaction.editReply({
                embeds: [new EmbedTemplate(client).error("Failed to transfer ticket ownership. Database operation failed.")]
            });
            return;
        }

        const channel = interaction.channel as discord.TextChannel;

        if (previousOwner &&
            previousOwner.id !== newOwner.id &&
            (!supportRoleId || !member.roles.cache.has(supportRoleId))) {
            try {
                const previousOwnerPerms = channel.permissionsFor(previousOwner.id);
                if (previousOwnerPerms && previousOwnerPerms.has(discord.PermissionFlagsBits.ViewChannel)) {
                    const confirmEmbed = new discord.EmbedBuilder()
                        .setTitle("Remove Previous Owner's Access?")
                        .setDescription(`Do you want to remove ${previousOwner}'s access to this ticket?`)
                        .setColor("Blue")
                        .setFooter({ text: "Reply with 'yes' or 'no'" });

                    await interaction.editReply({ embeds: [confirmEmbed] });

                    const filter = (m: discord.Message) => m.author.id === interaction.user.id &&
                        ['yes', 'no', 'y', 'n'].includes(m.content.toLowerCase());

                    try {
                        const collected = await channel.awaitMessages({
                            filter,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        const response = collected.first()?.content.toLowerCase();

                        try {
                            await collected.first()?.delete();
                        } catch (error) {
                            client.logger.debug(`[TRANSFER_OWNER] Could not delete response message: ${error}`);
                        }

                        if (response === 'yes' || response === 'y') {
                            await channel.permissionOverwrites.delete(previousOwner.id);
                            await channel.send({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setDescription(`${previousOwner}'s access to this ticket has been removed.`)
                                        .setColor("Red")
                                ]
                            });
                        } else {
                            await channel.send({
                                embeds: [
                                    new discord.EmbedBuilder()
                                        .setDescription(`${previousOwner} will maintain access to this ticket.`)
                                        .setColor("Blue")
                                ]
                            });
                        }
                    } catch (error) {
                        await channel.send({
                            embeds: [
                                new discord.EmbedBuilder()
                                    .setDescription(`No response received. ${previousOwner} will maintain access to this ticket.`)
                                    .setColor("Blue")
                            ]
                        });
                    }
                }
            } catch (error) {
                client.logger.error(`[TRANSFER_OWNER] Error handling previous owner permissions: ${error}`);
            }
        }

        await channel.permissionOverwrites.create(newOwner.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });

        const ticketNumber = ticket.ticketNumber.toString().padStart(4, '0');
        const currentName = channel.name;

        if (currentName.includes(ticketNumber)) {
            try {
                const newOwnerName = newOwner.username.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 15);
                if (currentName.includes('-')) {
                    const baseName = currentName.split('-').slice(0, 2).join('-');
                    await channel.setName(`${baseName}-${newOwnerName}`);
                }
            } catch (error) {
                client.logger.warn(`[TRANSFER_OWNER] Could not rename channel: ${error}`);

            }
        }

        await channel.send({
            embeds: [
                new discord.EmbedBuilder()
                    .setTitle("Ticket Ownership Transferred")
                    .setDescription(`Ownership of this ticket has been transferred from ${previousOwner ? `${previousOwner}` : 'the previous owner'} to ${newOwner}.`)
                    .setColor("Green")
                    .setTimestamp()
            ]
        });

        await interaction.editReply({
            embeds: [new EmbedTemplate(client).success(`Ticket ownership has been transferred to ${newOwner}.`)]
        });

        client.logger.info(`[TICKET_TRANSFER] ${interaction.user.tag} transferred ticket #${ticket.ticketNumber} ownership from ${previousOwner?.tag || ticket.creatorId} to ${newOwner.tag}`);
    } catch (error) {
        client.logger.error(`[TICKET_TRANSFER] Error transferring ticket ownership: ${error}`);
        await interaction.editReply({
            embeds: [new EmbedTemplate(client).error("An error occurred while transferring ticket ownership.")]
        });
    }
};