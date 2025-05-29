import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from "typeorm";

import { ITicket, ITicketStatus } from "../../../../types";

import { TicketCategory } from "./ticket_category";


@Entity("tickets")
export class Ticket implements ITicket {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    ticketNumber!: number;

    @Column({ nullable: false })
    channelId!: string;

    @Column({ nullable: false })
    creatorId!: string;

    @Column({ nullable: true })
    closedById?: string;

    @Column({ nullable: true, type: 'timestamp' })
    closedAt?: Date;

    @Column({ nullable: true, type: 'varchar' })
    claimedById?: string | null;

    @Column({ nullable: true, type: 'timestamp' })
    claimedAt?: Date | null;

    @Column({
        type: "enum",
        enum: ITicketStatus,
        default: ITicketStatus.OPEN
    })
    status!: ITicketStatus;

    @Column({ nullable: true, type: "text" })
    closeReason?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @ManyToOne(type => TicketCategory, category => category.tickets, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    category!: TicketCategory;
}