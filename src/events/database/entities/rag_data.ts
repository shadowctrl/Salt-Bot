import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, Index } from "typeorm";

@Entity("rag_documents")
export class RagDocument {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    @Index()
    guildId!: string;

    @Column({ nullable: false })
    fileName!: string;

    @Column({ type: "text", nullable: true })
    description!: string;

    @Column({ nullable: false })
    fileType!: string; // 'txt' or 'md'

    @Column({ nullable: false, default: 0 })
    chunkCount!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToMany(() => RagChunk, chunk => chunk.document, {
        cascade: true
    })
    chunks!: RagChunk[];
}

@Entity("rag_chunks")
export class RagChunk {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ type: "text", nullable: false })
    content!: string;

    @Column({ type: "integer", nullable: false })
    chunkIndex!: number;

    @Column("float", { array: true, nullable: true })
    embedding!: number[];

    @ManyToOne(() => RagDocument, document => document.chunks, {
        onDelete: "CASCADE"
    })
    document!: RagDocument;
}