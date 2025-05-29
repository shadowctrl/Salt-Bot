import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, ManyToOne } from "typeorm";

import { IBlockUser, IBlockReason } from "../../../types";

@Entity("blocked_users")
export class BlockedUser implements IBlockUser {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    userId!: string;

    @Column({ default: true })
    status!: boolean;

    @OneToMany(() => BlockReason, blockReason => blockReason.blockedUser, {
        cascade: true,
        eager: true
    })
    data!: BlockReason[];
}

@Entity("block_reasons")
export class BlockReason implements IBlockReason {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    reason!: string;

    @CreateDateColumn()
    timestamp!: Date;

    @ManyToOne(() => BlockedUser, blockedUser => blockedUser.data, {
        onDelete: "CASCADE"
    })
    blockedUser!: BlockedUser;
}