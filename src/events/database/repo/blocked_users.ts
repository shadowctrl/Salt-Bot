import { Repository, DataSource } from "typeorm";
import { BlockedUser, BlockReason } from "../entities/blocked_users";

/**
 * Repository class for managing blocked users in PostgreSQL
 * Provides methods for creating, fetching, and updating blocked user records
 */
export class BlockedUserRepository {
    private blockedUserRepo: Repository<BlockedUser>;
    private blockReasonRepo: Repository<BlockReason>;

    /**
     * Creates a new BlockedUserRepository instance
     * @param dataSource - TypeORM DataSource connection
     */
    constructor(dataSource: DataSource) {
        this.blockedUserRepo = dataSource.getRepository(BlockedUser);
        this.blockReasonRepo = dataSource.getRepository(BlockReason);
    }

    /**
     * Find a blocked user by their user ID
     * @param userId - Discord user ID
     * @returns The blocked user record or null if not found
     */
    async findByUserId(userId: string): Promise<BlockedUser | null> {
        return this.blockedUserRepo.findOne({
            where: { userId },
            relations: ['data']
        });
    }

    /**
     * Block a user with a specific reason
     * @param userId - Discord user ID
     * @param reason - Reason for blocking the user
     * @returns The created or updated blocked user record
     */
    async blockUser(userId: string, reason: string): Promise<BlockedUser> {
        let blockedUser = await this.findByUserId(userId);

        if (!blockedUser) {
            // Create new blocked user
            blockedUser = new BlockedUser();
            blockedUser.userId = userId;
            blockedUser.status = true;
            blockedUser.data = [];

            // Save to create the entity first (we need the ID for the relation)
            blockedUser = await this.blockedUserRepo.save(blockedUser);
        } else {
            // Update existing user's status
            blockedUser.status = true;
        }

        // Create a new block reason
        const blockReason = new BlockReason();
        blockReason.reason = reason;
        blockReason.blockedUser = blockedUser;
        await this.blockReasonRepo.save(blockReason);

        // Reload the blocked user with the updated data
        return this.findByUserId(userId) as Promise<BlockedUser>;
    }

    /**
     * Unblock a user
     * @param userId - Discord user ID
     * @returns True if the user was unblocked, false otherwise
     */
    async unblockUser(userId: string): Promise<boolean> {
        const blockedUser = await this.findByUserId(userId);

        if (!blockedUser) {
            return false;
        }

        blockedUser.status = false;
        await this.blockedUserRepo.save(blockedUser);
        return true;
    }

    /**
     * Get all blocked users
     * @returns List of all blocked users
     */
    async getAllBlockedUsers(): Promise<BlockedUser[]> {
        return this.blockedUserRepo.find({
            where: { status: true },
            relations: ['data']
        });
    }

    /**
     * Add a new reason to an existing blocked user
     * @param userId - Discord user ID
     * @param reason - New reason to add
     * @returns Updated blocked user or null if user not found
     */
    async addBlockReason(userId: string, reason: string): Promise<BlockedUser | null> {
        const blockedUser = await this.findByUserId(userId);

        if (!blockedUser) {
            return null;
        }

        const blockReason = new BlockReason();
        blockReason.reason = reason;
        blockReason.blockedUser = blockedUser;
        await this.blockReasonRepo.save(blockReason);

        return this.findByUserId(userId);
    }
}