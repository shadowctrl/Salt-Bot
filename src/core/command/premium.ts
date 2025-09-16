import { DataSource } from 'typeorm';
import voucher_codes from 'voucher-code-generator';

import client from '../../salt';
import { setSafeTimeout } from '../../utils/extras';
import { UserDataRepository } from '../../events/database/repo/user_data';
import { PremiumCoupon } from '../../events/database/entities/premium_coupons';
import { PremiumCouponRepository } from '../../events/database/repo/premium_coupon';

/**
 * Class to handle premium coupon generation, validation, and user premium status management.
 * Uses repository pattern to separate data access logic.
 */
class PremiumHandler {
	private readonly prefix: string = 'SALT-';
	private pattern: string;
	private couponRepo: PremiumCouponRepository;
	private userRepo: UserDataRepository;

	/**
	 * Creates a new PremiumHandler instance
	 *
	 * @param dataSource - TypeORM DataSource connection
	 * @param pattern - The pattern for coupon code generation (default: "####-####-####")
	 */
	constructor(dataSource: DataSource, pattern: string = '####-####-####') {
		this.pattern = pattern;
		this.couponRepo = new PremiumCouponRepository(dataSource);
		this.userRepo = new UserDataRepository(dataSource);
	}

	/**
	 * Generates unique premium coupon codes and stores them in the database
	 *
	 * @param userId - Discord user ID of the coupon generator
	 * @param count - Number of coupon codes to generate (default: 1)
	 * @param expiryDays - Number of days until coupon expires (default: 30)
	 * @returns Array of generated coupon codes or null if operation failed
	 */
	public generateCoupons = async (userId: string, count: number = 1, expiryDays: number = 30): Promise<string[] | null> => {
		try {
			let codes = this.generateCouponCodes(count);
			const existingCodes = new Set<string>();
			for (const code of codes) {
				const exists = await this.couponRepo.codeExists(code);
				if (exists) existingCodes.add(code);
			}

			codes = codes.filter((code) => !existingCodes.has(code));
			if (codes.length < count) {
				const additionalCodes = this.generateCouponCodes(count * 2);
				for (const code of additionalCodes) {
					if (codes.length >= count) break;
					const exists = await this.couponRepo.codeExists(code);
					if (!exists && !existingCodes.has(code)) codes.push(code);
				}
			}

			const couponData = codes.map((code) => ({ code, userId }));
			const createdCoupons = await this.couponRepo.createCouponBatch(couponData);
			if (createdCoupons.length === 0) return null;

			setSafeTimeout(async () => {
				await this.couponRepo.deleteExpiredCoupons(codes);
			}, expiryDays * 24 * 60 * 60 * 1000);
			return codes;
		} catch (error) {
			client.logger.error(`[PREMIUM_HANDLER] Error generating coupons: ${error}`);
			return null;
		}
	};

	/**
	 * Validates a coupon code and applies premium status to a user
	 *
	 * @param code - The coupon code to validate
	 * @param userId - Discord user ID of the user redeeming the coupon
	 * @param premiumDurationDays - Number of days to grant premium for (default: 30)
	 * @returns Boolean indicating if the operation was successful
	 */
	public redeemCoupon = async (code: string, userId: string, premiumDurationDays: number = 30): Promise<boolean> => {
		try {
			const coupon = await this.couponRepo.findByCode(code);
			if (!coupon || !coupon.status) return false;
			const marked = await this.couponRepo.markCouponAsUsed(code);
			if (!marked) return false;
			const result = await this.userRepo.extendPremium(userId, premiumDurationDays);
			return !!result;
		} catch (error) {
			client.logger.error(`[PREMIUM_HANDLER] Error redeeming coupon: ${error}`);
			return false;
		}
	};

	/**
	 * Retrieves available coupons for a user
	 *
	 * @param userId - Discord user ID of the coupon generator
	 * @returns Array of active coupon codes or empty array
	 */
	public getUserCoupons = async (userId: string): Promise<PremiumCoupon[]> => {
		try {
			return await this.couponRepo.findActiveByUserId(userId);
		} catch (error) {
			client.logger.error(`[PREMIUM_HANDLER] Error retrieving user coupons: ${error}`);
			return [];
		}
	};

	/**
	 * Checks if a user has premium status
	 *
	 * @param userId - Discord user ID to check
	 * @returns Object with premium status and expiry date or null if error
	 */
	public checkPremiumStatus = async (userId: string): Promise<[boolean, Date | null]> => {
		try {
			const userData = await this.userRepo.checkPremiumStatus(userId);
			return userData;
		} catch (error) {
			client.logger.error(`[PREMIUM_HANDLER] Error checking premium status: ${error}`);
			return [false, null];
		}
	};

	/**
	 * Revokes a user's premium status
	 *
	 * @param userId - Discord user ID to revoke premium from
	 * @returns Boolean indicating if the operation was successful
	 */
	public revokePremium = async (userId: string): Promise<boolean> => {
		try {
			return await this.userRepo.revokePremium(userId);
		} catch (error) {
			client.logger.error(`[PREMIUM_HANDLER] Error revoking premium: ${error}`);
			return false;
		}
	};

	/**
	 * Gets all users with active premium status
	 *
	 * @returns Array of user data with active premium
	 */
	public getAllPremiumUsers = async () => {
		try {
			return await this.userRepo.getAllPremiumUsers();
		} catch (error) {
			client.logger.error(`[PREMIUM_HANDLER] Error getting all premium users: ${error}`);
			return [];
		}
	};

	/**
	 * Private method to generate coupon codes using voucher-code-generator
	 *
	 * @private
	 * @param count - Number of codes to generate
	 * @returns Array of generated codes
	 */
	private generateCouponCodes = (count: number): string[] => {
		return voucher_codes.generate({ prefix: this.prefix, pattern: this.pattern, count });
	};
}

export default PremiumHandler;
