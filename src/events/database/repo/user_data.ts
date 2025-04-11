import client from "../../../salt";
import { Repository, DataSource } from "typeorm";
import { UserData } from "../entities/user_data";

/**
 * Repository class for managing user data in PostgreSQL
 * Provides methods for creating, fetching, and updating user records
 * @class UserDataRepository
 */
export class UserDataRepository {
    private userDataRepo: Repository<UserData>;
    private dataSource: DataSource;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.userDataRepo = dataSource.getRepository(UserData);
    }

    /**
     * Creates a new user data record in the database
     * @param userData - The user data to create
     * @returns The created user data or null if creation failed
     */
    async findByUserId(userId: string): Promise<UserData | null> {
        try {
            return await this.userDataRepo.findOne({
                where: { userId }
            });
        } catch (error) {
            client.logger.error(`[USER_DATA_REPO] Error finding user data by ID: ${error}`);
            return null;
        }
    }

    /**
     * Sets the premium status for a user
     * @param userId - Discord user ID
     * @param expiryDate - Date when the premium expires
     * @returns The updated user data or null if operation failed
     */
    async setUserPremium(userId: string, expiryDate: Date): Promise<UserData | null> {
        try {
            let userData = await this.findByUserId(userId);

            if (!userData) {
                userData = new UserData();
                userData.userId = userId;
            }

            userData.premiumStatus = true;
            userData.premiumExpiresAt = expiryDate;

            return await this.userDataRepo.save(userData);
        } catch (error) {
            client.logger.error(`[USER_DATA_REPO] Error setting user premium status: ${error}`);
            return null;
        }
    }

    /**
     * Generates unique coupon codes
     * @param count - Number of codes to generate
     * @returns Array of generated coupon codes
     */
    async extendPremium(userId: string, additionalDays: number): Promise<UserData | null> {
        try {
            const userData = await this.findByUserId(userId);

            if (!userData) {
                // User not found, create with new premium period
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + additionalDays);
                return this.setUserPremium(userId, expiryDate);
            }

            if (!userData.premiumStatus || !userData.premiumExpiresAt) {
                // User doesn't have active premium, set new period
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + additionalDays);
                userData.premiumStatus = true;
                userData.premiumExpiresAt = expiryDate;
            } else {
                // User has active premium, extend it
                const currentExpiry = new Date(userData.premiumExpiresAt);
                const now = new Date();

                // If already expired, start fresh from now
                if (currentExpiry < now) {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + additionalDays);
                    userData.premiumExpiresAt = expiryDate;
                } else {
                    // If not expired, add days to current expiry
                    currentExpiry.setDate(currentExpiry.getDate() + additionalDays);
                    userData.premiumExpiresAt = currentExpiry;
                }
            }

            return await this.userDataRepo.save(userData);
        } catch (error) {
            client.logger.error(`[USER_DATA_REPO] Error extending premium period: ${error}`);
            return null;
        }
    }

    /**
     * Revokes the premium status of a user
     * @param userId - Discord user ID
     * @returns Boolean indicating if the operation was successful
     */
    async revokePremium(userId: string): Promise<boolean> {
        try {
            const userData = await this.findByUserId(userId);

            if (!userData) {
                return false;
            }

            userData.premiumStatus = false;
            userData.premiumExpiresAt = null;

            await this.userDataRepo.save(userData);
            return true;
        } catch (error) {
            client.logger.error(`[USER_DATA_REPO] Error revoking premium status: ${error}`);
            return false;
        }
    }

    /**
     * Checks if a user has premium status
     * @param userId - Discord user ID
     * @returns [isPremium, premiumExpire] tuple
     *          isPremium: true if the user is premium, false otherwise
     *          premiumExpire: the premium expiration date if premium, null otherwise
     */
    async checkPremiumStatus(userId: string): Promise<[boolean, Date | null]> {
        try {
            const userData = await this.findByUserId(userId);

            if (!userData) {
                return [false, null];
            }

            // Check if premium has expired
            if (userData.premiumStatus && userData.premiumExpiresAt &&
                new Date(userData.premiumExpiresAt) < new Date()) {

                // Automatically update to expired status
                userData.premiumStatus = false;
                userData.premiumExpiresAt = null;
                await this.userDataRepo.save(userData);

                return [false, null];
            }

            return [userData.premiumStatus, userData.premiumExpiresAt];
        } catch (error) {
            client.logger.error(`[USER_DATA_REPO] Error checking premium status: ${error}`);
            return [false, null];
        }
    }

    /**
     * Retrieves all users with active premium status
     * @returns Array of user data with active premium status
     */
    async getAllPremiumUsers(): Promise<UserData[]> {
        try {
            const users = await this.userDataRepo.find();

            // Filter for users with active premium status
            return users.filter(user =>
                user.premiumStatus &&
                user.premiumExpiresAt &&
                new Date(user.premiumExpiresAt) > new Date()
            );
        } catch (error) {
            client.logger.error(`[USER_DATA_REPO] Error getting all premium users: ${error}`);
            return [];
        }
    }
}