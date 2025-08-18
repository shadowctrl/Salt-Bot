import { Repository, DataSource } from 'typeorm';

import client from '../../../salt';
import { PremiumCoupon } from '../entities/premium_coupons';

/**
 * Repository class for managing premium coupons in PostgreSQL
 * Provides methods for creating, fetching, and updating coupon records
 */
export class PremiumCouponRepository {
	private couponRepo: Repository<PremiumCoupon>;
	private dataSource: DataSource;

	/**
	 * Creates a new PremiumCouponRepository instance
	 * @param dataSource - TypeORM DataSource connection
	 */
	constructor(dataSource: DataSource) {
		this.dataSource = dataSource;
		this.couponRepo = dataSource.getRepository(PremiumCoupon);
	}

	/**
	 * Creates a new premium coupon in the database
	 * @param couponData - The coupon data to create
	 * @returns The created coupon or null if creation failed
	 */
	async createCoupon(couponData: { code: string; userId: string }): Promise<PremiumCoupon | null> {
		try {
			const coupon = new PremiumCoupon();
			coupon.code = couponData.code;
			coupon.userId = couponData.userId;
			coupon.status = true;
			coupon.createdAt = new Date();
			coupon.updatedAt = new Date();

			return await this.couponRepo.save(coupon);
		} catch (error) {
			client.logger.error(`[PREMIUM_USER_REPO] Error creating coupon: ${error}`);
			return null;
		}
	}

	/**
	 * Finds a coupon by its code
	 * @param code - The coupon code to search for
	 * @returns The found coupon or null if not found
	 */
	async findByCode(code: string): Promise<PremiumCoupon | null> {
		try {
			return await this.couponRepo.findOne({
				where: { code },
			});
		} catch (error) {
			client.logger.error(`[PREMIUM_USER_REPO] Error finding coupon by code: ${error}`);
			return null;
		}
	}

	/**
	 * Checks if a coupon exists in the database
	 * @param code - The coupon code to check
	 * @returns Boolean indicating if the coupon exists
	 */
	async codeExists(code: string): Promise<boolean> {
		try {
			const coupon = await this.findByCode(code);
			return !!coupon;
		} catch (error) {
			client.logger.error(`[PREMIUM_USER_REPO] Error checking if coupon exists: ${error}`);
			return false;
		}
	}

	/**
	 * Retrieves all active coupons created by a specific user
	 * @param userId - Discord user ID
	 * @returns Array of active coupons or empty array if none found
	 */
	async findActiveByUserId(userId: string): Promise<PremiumCoupon[]> {
		try {
			return await this.couponRepo.find({
				where: { userId, status: true },
			});
		} catch (error) {
			client.logger.error(`[PREMIUM_USER_REPO] Error finding coupons by user ID: ${error}`);
			return [];
		}
	}

	/**
	 * Updates a coupon's status to used (inactive)
	 * @param code - The coupon code to update
	 * @returns Boolean indicating if the update was successful
	 */
	async markCouponAsUsed(code: string): Promise<boolean> {
		try {
			const coupon = await this.findByCode(code);

			if (!coupon) {
				return false;
			}

			coupon.status = false;
			coupon.updatedAt = new Date();
			await this.couponRepo.save(coupon);

			return true;
		} catch (error) {
			client.logger.error(`[PREMIUM_USER_REPO] Error marking coupon as used: ${error}`);
			return false;
		}
	}

	/**
	 * Deletes expired coupons from the database
	 * @param codes - Array of coupon codes to check and delete if expired
	 * @returns Number of deleted coupons
	 */
	async deleteExpiredCoupons(codes: string[]): Promise<number> {
		try {
			const result = await this.couponRepo.delete({
				code: { $in: codes } as any,
				status: true,
			});

			return result.affected || 0;
		} catch (error) {
			client.logger.error(`[PREMIUM_USER_REPO] Error deleting expired coupons: ${error}`);
			return 0;
		}
	}

	/**
	 * Creates multiple coupon records in a batch operation
	 * @param coupons - Array of coupon data objects to create
	 * @returns Array of created coupons or empty array if operation failed
	 */
	async createCouponBatch(
		coupons: Array<{
			code: string;
			userId: string;
		}>
	): Promise<PremiumCoupon[]> {
		const queryRunner = this.dataSource.createQueryRunner();

		await queryRunner.connect();
		await queryRunner.startTransaction();

		try {
			const createdCoupons: PremiumCoupon[] = [];

			for (const couponData of coupons) {
				const coupon = new PremiumCoupon();
				coupon.code = couponData.code;
				coupon.userId = couponData.userId;
				coupon.status = true;
				coupon.createdAt = new Date();
				coupon.updatedAt = new Date();

				const createdCoupon = await queryRunner.manager.save(coupon);
				createdCoupons.push(createdCoupon);
			}

			await queryRunner.commitTransaction();
			return createdCoupons;
		} catch (error) {
			await queryRunner.rollbackTransaction();
			client.logger.error(`[PREMIUM_USER_REPO] Error creating coupon batch: ${error}`);
			return [];
		} finally {
			await queryRunner.release();
		}
	}
}
