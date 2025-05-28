import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";


@Entity("chat_history")
export class ChatHistoryEntry {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    @Index()
    guildId!: string;

    @Column({ nullable: false })
    @Index()
    userId!: string;

    @Column({ nullable: false })
    role!: string;

    @Column({ type: "text", nullable: false })
    content!: string;

    @CreateDateColumn()
    createdAt!: Date;
}