import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from "typeorm";
import { Ticket } from "./ticket";
import { GuildConfig } from "./guild_config";
import { TicketMessage } from "./ticket_message";
import { ITicketCategory } from "../../../../types";

@Entity("ticket_categories")
export class TicketCategory implements ITicketCategory {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    name!: string;

    @Column({ nullable: true, type: "text" })
    description?: string;

    @Column({ nullable: true })
    emoji?: string;

    @Column({ nullable: true })
    supportRoleId?: string;

    @Column({ default: 0 })
    ticketCount!: number;

    @Column({ default: true })
    isEnabled!: boolean;

    @Column({ default: 0 })
    position!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @ManyToOne(type => GuildConfig, guildConfig => guildConfig.ticketCategories, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    guildConfig!: GuildConfig;

    @OneToMany(type => Ticket, ticket => ticket.category, {
        cascade: true
    })
    tickets!: Ticket[];

    @OneToOne(type => TicketMessage, ticketMessage => ticketMessage.category, {
        cascade: true
    })
    ticketMessage!: TicketMessage;
}