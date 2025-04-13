import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from "typeorm";
import { GuildConfig } from "./guild_config";
import { ITicketButton } from "../../../../types";

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