import { TextChannel, EmbedBuilder, AttachmentBuilder, MessageCreateOptions, User, ChannelType } from 'discord.js';
import { createTranscript, ExportReturnType } from 'discord-html-transcripts';
import client from '../salt';
import { TicketRepository } from '../events/database/repo/ticket_system';

/**
 * Creates and sends a transcript of a ticket channel
 * @param channel The channel to create a transcript of
 * @param user The user who closed the ticket
 * @param reason The reason for closing the ticket
 * @param ticketId The database ID of the ticket
 * @param dataSource The database connection
 */
export const createAndSendTranscript = async (
    channel: TextChannel,
    user: User,
    reason: string,
    ticketId: string,
    dataSource: any
): Promise<void> => {
    try {
        // Get ticket information from database
        const ticketRepo = new TicketRepository(dataSource);
        const ticket = await ticketRepo.getTicket(ticketId);

        if (!ticket) {
            return client.logger.error(`[TRANSCRIPT] Could not find ticket with ID ${ticketId}`);
        }

        // Fetch the creator of the ticket
        const creator = await client.users.fetch(ticket.creatorId).catch(() => null);
        if (!creator) {
            return client.logger.error(`[TRANSCRIPT] Could not fetch ticket creator with ID ${ticket.creatorId}`);
        }

        // Fetch the claimer if the ticket was claimed
        let claimer = null;
        if (ticket.claimedById) {
            claimer = await client.users.fetch(ticket.claimedById).catch(() => null);
        }

        // Get guild configuration to find the transcript channel
        const guildConfig = await ticketRepo.getGuildConfig(channel.guildId);
        if (!guildConfig) {
            return client.logger.error(`[TRANSCRIPT] Could not find guild config for ${channel.guildId}`);
        }

        // Get the transcript channel (if configured in database)
        const transcriptChannelId = guildConfig.ticketButton?.logChannelId;
        if (!transcriptChannelId) {
            client.logger.warn(`[TRANSCRIPT] No transcript channel configured for guild ${channel.guildId}`);
            return;
        }

        const transcriptChannel = await client.channels.fetch(transcriptChannelId).catch(() => null);
        if (!transcriptChannel || transcriptChannel.type !== ChannelType.GuildText) {
            client.logger.error(`[TRANSCRIPT] Transcript channel not found or not a text channel: ${transcriptChannelId}`);
            return;
        }

        // Create a transcript of the channel
        client.logger.info(`[TRANSCRIPT] Creating transcript for ticket #${ticket.ticketNumber}`);

        const attachment = await createTranscript(channel, {
            limit: 10000, // Limit of messages to fetch (adjust as needed)
            saveImages: true,
            poweredBy: false,
            filename: `ticket-${ticket.ticketNumber}.html`,
        }) as AttachmentBuffer;

        // Create an embed for the transcript
        const embed = new EmbedBuilder()
            .setTitle(`Ticket #${ticket.ticketNumber} | Transcript`)
            .setDescription(`
        **Ticket Information**
        **User:** ${creator.tag} (${creator.id})
        **Ticket Number:** ${ticket.ticketNumber}
        **Category:** ${ticket.category?.name || 'Unknown'}
        ${claimer ? `**Handled by:** ${claimer.tag}` : ''}
        **Closed by:** ${user.tag}
        **Reason:** ${reason || 'No reason provided'}
        **Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>
      `)
            .setColor('#2F3136')
            .setFooter({ text: 'Salt Bot Ticket System', iconURL: client.user?.displayAvatarURL() })
            .setTimestamp();

        // Send transcript to the transcript channel
        await (transcriptChannel as TextChannel).send({
            embeds: [embed],
            files: [attachment],
        });

        // Optionally also DM the transcript to the user who created the ticket
        try {
            const userEmbed = new EmbedBuilder()
                .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
                .setDescription(`Your ticket in **${channel.guild.name}** has been closed.\n\n**Reason:** ${reason || 'No reason provided'}`)
                .setColor('#2F3136')
                .setFooter({ text: 'A transcript has been attached to this message', iconURL: client.user?.displayAvatarURL() })
                .setTimestamp();

            await creator.send({
                embeds: [userEmbed],
                files: [attachment],
            }).catch(() => client.logger.warn(`[TRANSCRIPT] Could not DM transcript to user ${creator.tag}`));
        } catch (error) {
            client.logger.error(`[TRANSCRIPT] Error sending DM to user: ${error}`);
        }

        client.logger.info(`[TRANSCRIPT] Transcript for ticket #${ticket.ticketNumber} created and sent successfully`);
    } catch (error) {
        client.logger.error(`[TRANSCRIPT] Error creating transcript: ${error}`);
    }
};

// Define the interface for the attachment buffer
interface AttachmentBuffer extends AttachmentBuilder {
    attachment: Buffer;
}

/**
 * Updates the database schema to add a transcript channel field to the ticket button table
 */
export const updateDatabaseSchema = async (dataSource: any): Promise<void> => {
    try {
        // Check if the column exists
        const ticketButtonRepo = dataSource.getRepository('ticket_buttons');
        const hasLogChannelColumn = await ticketButtonRepo.query(
            `SELECT column_name FROM information_schema.columns 
       WHERE table_name='ticket_buttons' AND column_name='log_channel_id'`
        );

        // Add the column if it doesn't exist
        if (!hasLogChannelColumn.length) {
            await dataSource.query(
                `ALTER TABLE ticket_buttons ADD COLUMN log_channel_id VARCHAR(255)`
            );
            client.logger.info('[DB] Added log_channel_id column to ticket_buttons table');
        }
    } catch (error) {
        client.logger.error(`[DB] Error updating database schema: ${error}`);
    }
};