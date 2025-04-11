import client from "../salt";
import PremiumHandler from "./premium_handler";
import { BlockedUserRepository } from "../events/database/repo/blocked_users";

/**
 * Check if a user is blocked and get the most recent block reason
 * @param userId - Discord user ID
 * @returns [isBlocked, reason] tuple
 *          isBlocked: true if the user is blocked, false otherwise
 *          reason: the most recent block reason if blocked, null otherwise
 */
const checkBlockedStatus = async (userId: string): Promise<[boolean, string | null]> => {
    try {
        const blockedUserRepo = new BlockedUserRepository((client as any).dataSource);

        // Use the new method to get the most recent block reason
        const [isBlocked, recentReason] = await blockedUserRepo.checkBlockStatus(userId);

        if (isBlocked && recentReason) {
            return [true, recentReason.reason];
        }

        return [isBlocked, null];
    } catch (error: Error | any) {
        client.logger.error(`[CHECK_BLOCKED] Error checking blocked status: ${error}`);
        return [false, null];
    }
};

/**
 * Check if a user is premium and get the premium expiration date
 * @param userId - Discord user ID
 * @returns [isPremium, premiumExpire] tuple
 *          isPremium: true if the user is premium, false otherwise
 *          premiumExpire: the premium expiration date if premium, null otherwise
 */
const checkPremiumStatus = async (userId: string): Promise<[boolean, Date | null]> => {
    try {
        const premiumHandler = new PremiumHandler((client as any).dataSource);

        const [isPremium, premiumExpire] = await premiumHandler.checkPremiumStatus(userId);

        if (isPremium && premiumExpire && new Date(premiumExpire) < new Date()) {
            await premiumHandler.revokePremium(userId);
            client.logger.info(`[PREMIUM] User ${userId} premium expired. Revoked.`);
            return [false, null];
        }

        return [isPremium, premiumExpire];
    } catch (error: Error | any) {
        client.logger.error(`[CHECK_PREMIUM] Error checking premium status: ${error}`);
        return [false, null];
    }
};

export { checkBlockedStatus, checkPremiumStatus };