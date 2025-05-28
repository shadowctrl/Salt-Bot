import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

import { IUserData } from "../../../types";


@Entity("user_data")
export class UserData implements IUserData {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: false })
    userId!: string;

    @Column({ default: false })
    premiumStatus!: boolean;

    @Column({ nullable: true, type: 'timestamp' })
    premiumExpiresAt!: Date | null;
}