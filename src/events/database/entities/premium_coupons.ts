import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";
import { IPremiumCoupon } from "../../../types";

@Entity("premium_coupons")
export class PremiumCoupon implements IPremiumCoupon {
    @PrimaryGeneratedColumn("uuid")
    id!: string; 

    @Column({ nullable: false })
    code!: string;

    @Column({ nullable: false })
    userId!: string; //person who has generated the coupon

    @Column({ default: true })
    status!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @CreateDateColumn()
    updatedAt!: Date;
}