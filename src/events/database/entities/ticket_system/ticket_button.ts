import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from "typeorm";

import { ITicketButton } from "../../../../types";

import { GuildConfig } from "./guild_config";

@Entity("ticket_buttons")
export class TicketButton implements ITicketButton {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ default: "Create Ticket" })
    label!: string;

    @Column({ default: "🎫" })
    emoji!: string;

    @Column({ default: "PRIMARY" })
    style!: string;

    @Column({ nullable: true })
    messageId?: string;

    @Column({ nullable: true, type: "text" })
    embedTitle?: string;

    @Column({ nullable: true, type: "text" })
    embedDescription?: string;

    @Column({ nullable: true })
    embedColor?: string;

    @Column({ nullable: true })
    channelId?: string;

    @Column({ nullable: true })
    logChannelId?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToOne(type => GuildConfig, guildConfig => guildConfig.ticketButton, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    guildConfig!: GuildConfig;
}