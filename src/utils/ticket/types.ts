import discord from "discord.js";
import { ITicket } from "../../types";


export interface CreateTicketOptions {
    guildId: string;
    userId: string;
    categoryId: string;
    initialMessage?: string;
}

export interface CloseTicketOptions {
    channelId: string;
    userId: string;
    reason?: string;
    generateTranscript?: boolean;
}

export interface TicketOperationResult {
    success: boolean;
    message: string;
    ticket?: ITicket;
    channel?: discord.TextChannel;
    data?: any;
}

export interface ChannelCreationResult {
    success: boolean;
    channel?: discord.TextChannel;
    message?: string;
}

export interface PermissionCheckResult {
    hasPermission: boolean;
    reason?: string;
}

export type TicketAction = 'claim' | 'close' | 'add_user' | 'remove_user' | 'transfer_ownership' | 'archive' | 'delete';

export interface TicketMessages {
    welcome?: string;
    close?: string;
    claim?: string;
    unclaim?: string;
    reopen?: string;
    archive?: string;
    userAdded?: string;
    userRemoved?: string;
    ownershipTransfer?: string;
    deletion?: string;
}