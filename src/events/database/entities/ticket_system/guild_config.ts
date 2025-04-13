import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, OneToOne } from "typeorm";
import { TicketCategory } from "./ticket_category";
import { TicketButton } from "./ticket_button";
import { SelectMenuConfig } from "./select_menu";
import { IGuildConfig } from "../../../../types";

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

    @OneToMany(type => TicketCategory, category => category.guildConfig, {
        cascade: true
    })
    ticketCategories!: TicketCategory[];

    @OneToOne(type => TicketButton, ticketButton => ticketButton.guildConfig, {
        cascade: true
    })
    ticketButton!: TicketButton;

    @OneToOne(type => SelectMenuConfig, selectMenu => selectMenu.guildConfig, {
        cascade: true
    })
    selectMenu!: SelectMenuConfig;
}