import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from "typeorm";
import { ITicketStatus } from "./index";
import { TicketCategory } from "./ticket_category";
import { ITicket } from "../../../../types";

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