import voucher_codes from "voucher-code-generator";

/**
 * Class to handle premium coupon.
 * @class PremiumHandler
 */
class PremiumHandler {
    private readonly prefix: string = "SALT-";
    private pattern: string;

    private constructor(pattern: string = "####-####-####-####") {
        this.pattern = pattern;
    }

    /**
     * Creates an instance of PremiumHandler.
     * @param count - The number of characters in the coupon code.
     * @returns List of generated coupon codes.
     */
    public generateCoupon = (count: number = 1, validtill: Date): string[] => {
        const code = voucher_codes.generate({
            prefix: this.prefix,
            pattern: this.pattern,
            count: count
        });
        return code;
    }
}