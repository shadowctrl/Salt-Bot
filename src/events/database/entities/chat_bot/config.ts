import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";


@Entity("chatbot_configs")
export class ChatbotConfig {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    guildId!: string;

    @Column({ nullable: false })
    channelId!: string;

    @Column({ nullable: false })
    apiKey!: string;

    @Column({ default: "https://api.openai.com/v1" })
    baseUrl!: string;

    @Column({ default: "Salty" })
    chatbotName!: string;

    @Column({ nullable: false, default: "gpt-4o-mini" })
    modelName!: string;

    @Column({ type: "text", nullable: true, default: "Friendly" })
    responseType!: string;

    @Column({ default: 5 })
    cooldown!: number;

    @Column({ default: true })
    enabled!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}