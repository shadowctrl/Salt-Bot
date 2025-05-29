import { Repository, DataSource } from "typeorm";

import client from "../../../salt";
import { BlockedUser, BlockReason } from "../entities/blocked_users";


/**
 * Repository class for managing blocked users in PostgreSQL
 * Provides methods for creating, fetching, and updating blocked user records
 */
export class BlockedUserRepository {
    private blockedUserRepo: Repository<BlockedUser>;
    private blockReasonRepo: Repository<BlockReason>;
    private dataSource: DataSource;

    /**
     * Creates a new BlockedUserRepository instance
     * @param dataSource - TypeORM DataSource connection
     */
    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.blockedUserRepo = dataSource.getRepository(BlockedUser);
        this.blockReasonRepo = dataSource.getRepository(BlockReason);
    }

    /**
     * Find a blocked user by their user ID
     * @param userId - Discord user ID
     * @returns The blocked user record or null if not found
     */
    async findByUserId(userId: string): Promise<BlockedUser | null> {
        try {
            return await this.blockedUserRepo.findOne({
                where: { userId },
                relations: ['data']
            });
        } catch (error) {
            client.logger.error(`[BLOCKED_USER_REPO] Error finding user ${userId}: ${error}`);
            return null;
        }
    }

    /**
     * Get the most recent block reason for a user
     * @param userId - Discord user ID
     * @returns The most recent block reason or null if not found
     */
    async getMostRecentBlockReason(userId: string): Promise<BlockReason | null> {
        try {
            const blockedUser = await this.findByUserId(userId);
            if (!blockedUser || !blockedUser.data || blockedUser.data.length === 0) {
                return null;
            }
            return blockedUser.data.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )[0];
        } catch (error) {
            client.logger.error(`[BLOCKED_USER_REPO] Error getting recent block reason for user ${userId}: ${error}`);
            return null;
        }
    }

    /**
     * Block a user with a specific reason
     * @param userId - Discord user ID
     * @param reason - Reason for blocking the user
     * @returns The created or updated blocked user record
     */
    async blockUser(userId: string, reason: string): Promise<BlockedUser | null> {

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            let blockedUser = await this.findByUserId(userId);

            if (!blockedUser) {
                blockedUser = new BlockedUser();
                blockedUser.userId = userId;
                blockedUser.status = true;
                blockedUser.data = [];

                blockedUser = await this.blockedUserRepo.save(blockedUser);
            } else {
                blockedUser.status = true;
                await this.blockedUserRepo.save(blockedUser);
            }

            const blockReason = new BlockReason();
            blockReason.reason = reason;
            blockReason.blockedUser = blockedUser;
            await this.blockReasonRepo.save(blockReason);
            await queryRunner.commitTransaction();
            return this.findByUserId(userId);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[BLOCKED_USER_REPO] Error blocking user ${userId}: ${error}`);
            return null;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Unblock a user and record the reason
     * @param userId - Discord user ID
     * @param reason - Reason for unblocking
     * @returns True if the user was unblocked, false otherwise
     */
    async unblockUser(userId: string, reason: string): Promise<boolean> {
        const queryRunner = this.dataSource.createQueryRunner();

        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const blockedUser = await this.findByUserId(userId);

            if (!blockedUser) {
                return false;
            }

            blockedUser.status = false;
            await this.blockedUserRepo.save(blockedUser);
            const blockReason = new BlockReason();
            blockReason.reason = `UNBLOCKED: ${reason}`;
            blockReason.blockedUser = blockedUser;
            await this.blockReasonRepo.save(blockReason);

            await queryRunner.commitTransaction();
            return true;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[BLOCKED_USER_REPO] Error unblocking user ${userId}: ${error}`);
            return false;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Check if a user is currently blocked
     * @param userId - Discord user ID
     * @returns [isBlocked, mostRecentReason] tuple
     */
    async checkBlockStatus(userId: string): Promise<[boolean, BlockReason | null]> {
        try {
            const blockedUser = await this.findByUserId(userId);

            if (!blockedUser) {
                return [false, null];
            }

            if (blockedUser.status) {
                const recentReason = await this.getMostRecentBlockReason(userId);
                return [true, recentReason];
            }

            return [false, null];
        } catch (error) {
            client.logger.error(`[BLOCKED_USER_REPO] Error checking block status for user ${userId}: ${error}`);
            return [false, null];
        }
    }

    /**
     * Get all blocked users
     * @returns List of all blocked users
     */
    async getAllBlockedUsers(): Promise<BlockedUser[]> {
        try {
            return await this.blockedUserRepo.find({
                where: { status: true },
                relations: ['data']
            });
        } catch (error) {
            client.logger.error(`[BLOCKED_USER_REPO] Error getting all blocked users: ${error}`);
            return [];
        }
    }

    /**
     * Add a new reason to an existing blocked user
     * @param userId - Discord user ID
     * @param reason - New reason to add
     * @returns Updated blocked user or null if user not found
     */
    async addBlockReason(userId: string, reason: string): Promise<BlockedUser | null> {
        const queryRunner = this.dataSource.createQueryRunner();

        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const blockedUser = await this.findByUserId(userId);

            if (!blockedUser) {
                return null;
            }

            const blockReason = new BlockReason();
            blockReason.reason = reason;
            blockReason.blockedUser = blockedUser;
            await this.blockReasonRepo.save(blockReason);

            await queryRunner.commitTransaction();

            return this.findByUserId(userId);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            client.logger.error(`[BLOCKED_USER_REPO] Error adding block reason for user ${userId}: ${error}`);
            return null;
        } finally {
            await queryRunner.release();
        }
    }
}