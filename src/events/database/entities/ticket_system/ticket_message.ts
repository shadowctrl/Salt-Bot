import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from "typeorm";

import { ITicketMessage } from "../../../../types";

import { TicketCategory } from "./ticket_category";


@Entity("ticket_messages")
export class TicketMessage implements ITicketMessage {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: true, type: "text" })
    welcomeMessage?: string;

    @Column({ nullable: true, type: "text" })
    closeMessage?: string;

    @Column({ default: true })
    includeSupportTeam!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToOne(type => TicketCategory, category => category.ticketMessage, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    category!: TicketCategory;
}