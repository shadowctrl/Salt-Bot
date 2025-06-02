#!/usr/bin/env node

/**
 * Script to generate a secure master encryption key for the Discord bot
 * Run this script to generate a new MASTER_ENCRYPTION_KEY
 * 
 * Usage: npm run generate-key
 * Or: node scripts/generateKey.js
 */

import crypto from "crypto";

const generateSecureKey = (length = 64) => {
    const randomBytes = crypto.randomBytes(length);
    const hexKey = randomBytes.toString('hex');
    const additionalChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    let enhancedKey = '';

    for (let i = 0; i < hexKey.length; i++) {
        enhancedKey += hexKey[i];

        if ((i + 1) % 8 === 0 && i < hexKey.length - 1) {
            const randomChar = additionalChars[crypto.randomInt(0, additionalChars.length)];
            enhancedKey += randomChar;
        }
    }

    return enhancedKey;
};

const validateKeyStrength = (key) => {
    const feedback = [];
    let score = 0;

    if (key.length >= 64) {
        score += 30;
    } else if (key.length >= 32) {
        score += 20;
        feedback.push("Consider using a longer key (64+ characters) for maximum security");
    } else {
        feedback.push("Key should be at least 32 characters long");
    }

    if (/[a-z]/.test(key)) score += 15;
    else feedback.push("Include lowercase letters");

    if (/[A-Z]/.test(key)) score += 15;
    else feedback.push("Include uppercase letters");

    if (/[0-9]/.test(key)) score += 15;
    else feedback.push("Include numbers");

    if (/[^A-Za-z0-9]/.test(key)) score += 25;
    else feedback.push("Include special characters");

    const isStrong = score >= 80;

    return { score, feedback, isStrong };
};

const main = () => {
    console.log('🔐 Salt Bot Encryption Key Generator');
    console.log('=====================================\n');

    const keys = [
        generateSecureKey(32),
        generateSecureKey(48),
        generateSecureKey(64)
    ];

    console.log('Generated secure master encryption keys:\n');

    keys.forEach((key, index) => {
        const strength = validateKeyStrength(key);

        console.log(`Option ${index + 1} (${key.length} characters):`);
        console.log(`Key: ${key}`);
        console.log(`Strength Score: ${strength.score}/100 ${strength.isStrong ? '✅' : '⚠️'}`);

        if (strength.feedback.length > 0) {
            console.log(`Feedback: ${strength.feedback.join(', ')}`);
        }

        console.log('');
    });

    console.log('📋 Setup Instructions:');
    console.log('1. Copy one of the keys above');
    console.log('2. Add it to your .env file as:');
    console.log('   MASTER_ENCRYPTION_KEY=your_copied_key_here');
    console.log('3. NEVER commit this key to version control');
    console.log('4. Store the key securely for backup purposes');
    console.log('5. Use the same key across all environments for the same database\n');

    console.log('⚠️  Security Notes:');
    console.log('• Changing this key will make existing encrypted data unreadable');
    console.log('• Store this key in a secure password manager');
    console.log('• Use different keys for development and production');
    console.log('• Consider implementing key rotation policies for production\n');

    console.log('🔒 Recommended: Use Option 3 (64 characters) for maximum security');
};

if (require.main === module) {
    main();
}

export { generateSecureKey, validateKeyStrength };