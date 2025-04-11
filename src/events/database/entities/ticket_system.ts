import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from "typeorm";
import { IGuildConfig, ITicketCategory, ITicket, ITicketMessage, ITicketButton, ISelectMenuConfig, ITicketStatus } from "../../../types";

@Entity("guild_configs")
export class GuildConfig implements IGuildConfig {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false, unique: true })
    guildId!: string;

    @Column({ default: "tickets" })
    defaultCategoryName!: string;

    @Column({ default: true })
    isEnabled!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToMany(() => TicketCategory, category => category.guildConfig, {
        cascade: true
    })
    ticketCategories!: TicketCategory[];

    @OneToOne(() => TicketButton, ticketButton => ticketButton.guildConfig, {
        cascade: true
    })
    ticketButton!: TicketButton;

    @OneToOne(() => SelectMenuConfig, selectMenu => selectMenu.guildConfig, {
        cascade: true
    })
    selectMenu!: SelectMenuConfig;
}

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

    @ManyToOne(() => GuildConfig, guildConfig => guildConfig.ticketCategories, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    guildConfig!: GuildConfig;

    @OneToMany(() => Ticket, ticket => ticket.category, {
        cascade: true
    })
    tickets!: Ticket[];

    @OneToOne(() => TicketMessage, ticketMessage => ticketMessage.category, {
        cascade: true
    })
    ticketMessage!: TicketMessage;
}

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

    @ManyToOne(() => TicketCategory, category => category.tickets, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    category!: TicketCategory;
}

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

    @OneToOne(() => TicketCategory, category => category.ticketMessage, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    category!: TicketCategory;
}

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

    @OneToOne(() => GuildConfig, guildConfig => guildConfig.ticketButton, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    guildConfig!: GuildConfig;
}

@Entity("select_menu_configs")
export class SelectMenuConfig implements ISelectMenuConfig {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ default: "Select a ticket category" })
    placeholder!: string;

    @Column({ nullable: true })
    messageId?: string;

    @Column({ default: 1 })
    minValues!: number;

    @Column({ default: 1 })
    maxValues!: number;

    @Column({ nullable: true, type: "text" })
    embedTitle?: string;

    @Column({ nullable: true, type: "text" })
    embedDescription?: string;

    @Column({ nullable: true })
    embedColor?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToOne(() => GuildConfig, guildConfig => guildConfig.selectMenu, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    guildConfig!: GuildConfig;
}