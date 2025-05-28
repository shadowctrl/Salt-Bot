import { ITicketStatus } from '../events/database/entities/ticket_system';

export interface IBlockUser {
    id?: string;
    userId: string;
    status: boolean;
    data: IBlockReason[];
}

export interface IBlockReason {
    id?: string;
    reason: string;
    timestamp: Date;
}

export interface IPremiumCoupon {
    id?: string;
    code: string;
    userId: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserData {
    id?: string;
    userId: string;
    premiumStatus: boolean;
    premiumExpiresAt: Date | null;
}

export interface IGuildConfig {
    id: string;
    guildId: string;
    defaultCategoryName: string;
    globalTicketCount: number;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    ticketCategories: ITicketCategory[];
    ticketButton: ITicketButton;
    selectMenu: ISelectMenuConfig;
}

export interface ITicketCategory {
    id: string;
    name: string;
    categoryId: string;
    description?: string;
    emoji?: string;
    supportRoleId?: string;
    ticketCount: number;
    isEnabled: boolean;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    guildConfig: IGuildConfig;
    tickets: ITicket[];
    ticketMessage: ITicketMessage;
}

export interface ITicket {
    id: string;
    ticketNumber: number;
    channelId: string;
    creatorId: string;
    closedById?: string;
    closedAt?: Date;
    claimedById?: string | null;
    claimedAt?: Date | null;
    status: ITicketStatus;
    closeReason?: string;
    createdAt: Date;
    updatedAt: Date;
    category: ITicketCategory;
}

export interface ITicketMessage {
    id: string;
    welcomeMessage?: string;
    closeMessage?: string;
    includeSupportTeam: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: ITicketCategory;
}

export interface ITicketButton {
    id: string;
    label: string;
    emoji: string;
    style: string;
    messageId?: string;
    embedTitle?: string;
    embedDescription?: string;
    embedColor?: string;
    channelId?: string;
    logChannelId?: string;
    createdAt: Date;
    updatedAt: Date;
    guildConfig: IGuildConfig;
}

export interface ISelectMenuConfig {
    id: string;
    placeholder: string;
    messageId?: string;
    minValues: number;
    maxValues: number;
    embedTitle?: string;
    embedDescription?: string;
    embedColor?: string;
    createdAt: Date;
    updatedAt: Date;
    guildConfig: IGuildConfig;
}