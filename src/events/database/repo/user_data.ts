import { Repository, DataSource } from "typeorm";
import { UserData } from "../entities/user_data";

/**
 * Repository class for managing user data in PostgreSQL
 * Provides methods for creating, fetching, and updating user premium status
 */
export class UserDataRepository {
    private userDataRepo: Repository<UserData>;
    private dataSource: DataSource;

    /**
     * Creates a new UserDataRepository instance
     * @param dataSource - TypeORM DataSource connection
     */
    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.userDataRepo = dataSource.getRepository(UserData);
    }

    /**
     * Finds a user by their user ID
     * @param userId - Discord user ID
     * @returns The found user data or null if not found
     */
    async findByUserId(userId: string): Promise<UserData | null> {
        try {
            return await this.userDataRepo.findOne({
                where: { userId }
            });
        } catch (error) {
            console.error(`Error finding user data by ID: ${error}`);
            return null;
        }
    }

    /**
     * Creates or updates a user with premium status
     * @param userId - Discord user ID
     * @param expiryDate - Date when premium status expires
     * @returns The updated user data or null if operation failed
     */
    async setUserPremium(userId: string, expiryDate: Date): Promise<UserData | null> {
        try {
            let userData = await this.findByUserId(userId);

            if (!userData) {
                userData = new UserData();
                userData.userId = userId;
            }

            userData.premium = {
                status: true,
                expiresAt: expiryDate
            };

            return await this.userDataRepo.save(userData);
        } catch (error) {
            console.error(`Error setting user premium status: ${error}`);
            return null;
        }
    }

    /**
     * Extends a user's premium period by adding days to current expiry
     * @param userId - Discord user ID
     * @param additionalDays - Number of days to add to premium period
     * @returns The updated user data or null if operation failed
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

            if (!userData.premium?.status || !userData.premium.expiresAt) {
                // User doesn't have active premium, set new period
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + additionalDays);
                userData.premium = {
                    status: true,
                    expiresAt: expiryDate
                };
            } else {
                // User has active premium, extend it
                const currentExpiry = new Date(userData.premium.expiresAt);
                const now = new Date();

                // If already expired, start fresh from now
                if (currentExpiry < now) {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + additionalDays);
                    userData.premium.expiresAt = expiryDate;
                } else {
                    // If not expired, add days to current expiry
                    currentExpiry.setDate(currentExpiry.getDate() + additionalDays);
                    userData.premium.expiresAt = currentExpiry;
                }
            }

            return await this.userDataRepo.save(userData);
        } catch (error) {
            console.error(`Error extending premium period: ${error}`);
            return null;
        }
    }

    /**
     * Revokes a user's premium status
     * @param userId - Discord user ID
     * @returns Boolean indicating if the operation was successful
     */
    async revokePremium(userId: string): Promise<boolean> {
        try {
            const userData = await this.findByUserId(userId);

            if (!userData) {
                return false;
            }

            userData.premium = {
                status: false,
                expiresAt: null
            };

            await this.userDataRepo.save(userData);
            return true;
        } catch (error) {
            console.error(`Error revoking premium status: ${error}`);
            return false;
        }
    }

    /**
     * Checks if a user's premium status is still valid and updates if expired
     * @param userId - Discord user ID
     * @returns Object with premium status and expiry date or null if error occurred
     */
    async checkPremiumStatus(userId: string): Promise<{ status: boolean; expiresAt: Date | null } | null> {
        try {
            const userData = await this.findByUserId(userId);

            if (!userData || !userData.premium) {
                return { status: false, expiresAt: null };
            }

            // Check if premium has expired
            if (userData.premium.status && userData.premium.expiresAt &&
                new Date(userData.premium.expiresAt) < new Date()) {

                // Automatically update to expired status
                userData.premium.status = false;
                await this.userDataRepo.save(userData);

                return { status: false, expiresAt: null };
            }

            return {
                status: userData.premium.status,
                expiresAt: userData.premium.expiresAt
            };
        } catch (error) {
            console.error(`Error checking premium status: ${error}`);
            return null;
        }
    }

    /**
     * Gets all users with active premium status
     * @returns Array of users with active premium or empty array if none found
     */
    async getAllPremiumUsers(): Promise<UserData[]> {
        try {
            const users = await this.userDataRepo.find();

            // Filter for users with active premium status
            return users.filter(user =>
                user.premium?.status &&
                user.premium.expiresAt &&
                new Date(user.premium.expiresAt) > new Date()
            );
        } catch (error) {
            console.error(`Error getting all premium users: ${error}`);
            return [];
        }
    }
}