import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from "typeorm";

import { ISelectMenuConfig } from "../../../../types";

import { GuildConfig } from "./guild_config";


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

    @OneToOne(type => GuildConfig, guildConfig => guildConfig.selectMenu, {
        onDelete: "CASCADE"
    })
    @JoinColumn()
    guildConfig!: GuildConfig;
}