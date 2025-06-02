import crypto from "crypto";

/**
 * Encryption utility for securing sensitive data like API keys
 * Uses AES-256-GCM for symmetric encryption with authentication
 */
export class EncryptionUtil {
    private static readonly ALGORITHM = "aes-256-gcm";
    private static readonly IV_LENGTH = 16; // 128 bits
    private static readonly TAG_LENGTH = 16; // 128 bits
    private static readonly SALT_LENGTH = 32; // 256 bits

    /**
     * Get the master encryption key from environment variables
     * @returns Master encryption key as Buffer
     * @throws Error if master key is not configured
     */
    private static getMasterKey = (): Buffer => {
        const masterKey = process.env.MASTER_ENCRYPTION_KEY;

        if (!masterKey) {
            throw new Error("MASTER_ENCRYPTION_KEY environment variable is not set");
        }

        if (masterKey.length < 32) {
            throw new Error("MASTER_ENCRYPTION_KEY must be at least 32 characters long");
        }

        return crypto.pbkdf2Sync(masterKey, "salt-bot-encryption", 10000, 32, "sha256");
    };

    /**
     * Encrypts a plaintext string using AES-256-GCM
     * @param plaintext - The text to encrypt
     * @returns Encrypted data in format: salt:iv:tag:ciphertext (base64 encoded)
     * @throws Error if encryption fails
     */
    public static encrypt = (plaintext: string): string => {
        try {
            if (!plaintext || plaintext.trim().length === 0) {
                throw new Error("Cannot encrypt empty or whitespace-only text");
            }

            const salt = crypto.randomBytes(EncryptionUtil.SALT_LENGTH);
            const masterKey = EncryptionUtil.getMasterKey();
            const derivedKey = crypto.pbkdf2Sync(masterKey, salt, 10000, 32, "sha256");
            const iv = crypto.randomBytes(EncryptionUtil.IV_LENGTH);
            const cipher = crypto.createCipheriv(EncryptionUtil.ALGORITHM, derivedKey, iv);

            cipher.setAAD(Buffer.from("salt-bot"));

            let ciphertext = cipher.update(plaintext, "utf8", "base64");
            ciphertext += cipher.final("base64");

            const tag = cipher.getAuthTag();
            const combined = `${salt.toString("base64")}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext}`;

            return combined;
        } catch (error) {
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    /**
     * Decrypts an encrypted string using AES-256-GCM
     * @param encryptedData - The encrypted data in format: salt:iv:tag:ciphertext
     * @returns Decrypted plaintext string
     * @throws Error if decryption fails or data is invalid
     */
    public static decrypt = (encryptedData: string): string => {
        try {
            if (!encryptedData || encryptedData.trim().length === 0) {
                throw new Error("Cannot decrypt empty or whitespace-only data");
            }

            const parts = encryptedData.split(":");
            if (parts.length !== 4) {
                throw new Error("Invalid encrypted data format");
            }

            const [saltStr, ivStr, tagStr, ciphertext] = parts;

            const salt = Buffer.from(saltStr, "base64");
            const iv = Buffer.from(ivStr, "base64");
            const tag = Buffer.from(tagStr, "base64");

            if (salt.length !== EncryptionUtil.SALT_LENGTH) {
                throw new Error("Invalid salt length");
            }
            if (iv.length !== EncryptionUtil.IV_LENGTH) {
                throw new Error("Invalid IV length");
            }
            if (tag.length !== EncryptionUtil.TAG_LENGTH) {
                throw new Error("Invalid tag length");
            }

            const masterKey = EncryptionUtil.getMasterKey();
            const derivedKey = crypto.pbkdf2Sync(masterKey, salt, 10000, 32, "sha256");
            const decipher = crypto.createDecipheriv(EncryptionUtil.ALGORITHM, derivedKey, iv);

            decipher.setAuthTag(tag);
            decipher.setAAD(Buffer.from("salt-bot"));

            let plaintext = decipher.update(ciphertext, "base64", "utf8");
            plaintext += decipher.final("utf8");

            return plaintext;
        } catch (error) {
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    /**
     * Validates that a string appears to be encrypted data
     * @param data - String to validate
     * @returns True if the data appears to be encrypted
     */
    public static isEncrypted = (data: string): boolean => {
        if (!data || data.trim().length === 0) {
            return false;
        }

        const parts = data.split(":");
        if (parts.length !== 4) {
            return false;
        }

        try {
            const salt = Buffer.from(parts[0], "base64");
            const iv = Buffer.from(parts[1], "base64");
            const tag = Buffer.from(parts[2], "base64");

            return (
                salt.length === EncryptionUtil.SALT_LENGTH &&
                iv.length === EncryptionUtil.IV_LENGTH &&
                tag.length === EncryptionUtil.TAG_LENGTH
            );
        } catch {
            return false;
        }
    };

    /**
     * Generates a secure random master key for initial setup
     * @param length - Length of the key in bytes (default: 32)
     * @returns Random key as hex string
     */
    public static generateMasterKey = (length: number = 32): string => {
        return crypto.randomBytes(length).toString("hex");
    };

    /**
     * Securely clears a string from memory (best effort)
     * @param sensitiveString - String to clear
     */
    public static clearSensitiveData = (sensitiveString: string): void => {
        if (typeof sensitiveString === "string") {
            for (let i = 0; i < sensitiveString.length; i++) {
                (sensitiveString as any)[i] = '\0';
            }
        }
    };

    /**
     * Validates the master encryption key strength
     * @returns Object with validation result and recommendations
     */
    public static validateMasterKey = (): { isValid: boolean; message: string; recommendations: string[] } => {
        try {
            const masterKey = process.env.MASTER_ENCRYPTION_KEY;
            const recommendations: string[] = [];

            if (!masterKey) {
                return {
                    isValid: false,
                    message: "Master encryption key is not configured",
                    recommendations: [
                        "Set MASTER_ENCRYPTION_KEY environment variable",
                        "Use a key of at least 32 characters",
                        "Include uppercase, lowercase, numbers, and special characters",
                        "Never commit the key to version control"
                    ]
                };
            }

            if (masterKey.length < 32) {
                recommendations.push("Increase key length to at least 32 characters");
            }

            if (masterKey.length < 64) {
                recommendations.push("Consider using a longer key (64+ characters) for better security");
            }

            if (!/[A-Z]/.test(masterKey)) {
                recommendations.push("Include uppercase letters");
            }

            if (!/[a-z]/.test(masterKey)) {
                recommendations.push("Include lowercase letters");
            }

            if (!/[0-9]/.test(masterKey)) {
                recommendations.push("Include numbers");
            }

            if (!/[^A-Za-z0-9]/.test(masterKey)) {
                recommendations.push("Include special characters");
            }

            const isValid = masterKey.length >= 32;

            return {
                isValid,
                message: isValid ? "Master encryption key is valid" : "Master encryption key needs improvement",
                recommendations
            };
        } catch (error) {
            return {
                isValid: false,
                message: `Error validating master key: ${error instanceof Error ? error.message : String(error)}`,
                recommendations: ["Check environment variable configuration"]
            };
        }
    };
}