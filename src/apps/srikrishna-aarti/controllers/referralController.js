const { ReferringUser, ReferralLog } = require('../models');

/**
 * Helper to generate a unique referral code
 */
const generateReferralCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `KRISHNA-${code}`;
};

/**
 * GET /api/srikrishna-aarti/referral/status
 * Get or create user status and referral code
 */
exports.getStatus = async (req, res, next) => {
    try {
        const { deviceId } = req.query;

        if (!deviceId) {
            return res.status(400).json({ success: false, message: 'deviceId is required' });
        }

        let user = await ReferringUser.findOne({ deviceId });

        if (!user) {
            // Create new user with a unique code
            let referralCode;
            let isUnique = false;

            // Safety loop to ensure uniqueness
            while (!isUnique) {
                referralCode = generateReferralCode();
                const existing = await ReferringUser.findOne({ referralCode });
                if (!existing) isUnique = true;
            }

            user = await ReferringUser.create({
                deviceId,
                referralCode,
                pendingRewards: 0
            });
        }

        res.status(200).json({
            success: true,
            pendingRewards: user.pendingRewards,
            referralCode: user.referralCode
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/referral/redeem
 * User B redeems User A's code
 */
exports.redeemCode = async (req, res, next) => {
    try {
        const { inviteCode, deviceId } = req.body;

        if (!inviteCode || !deviceId) {
            return res.status(400).json({ success: false, message: 'inviteCode and deviceId are required' });
        }

        // 1. Exist Check: Does inviteCode belong to a real user?
        const referrer = await ReferringUser.findOne({ referralCode: inviteCode });
        if (!referrer) {
            return res.status(404).json({ success: false, message: 'Invalid referral code' });
        }

        // 2. Self Check: Is deviceId the same as the code owner?
        if (referrer.deviceId === deviceId) {
            return res.status(400).json({ success: false, message: 'You cannot redeem your own code' });
        }

        // 3. Double Redeem Check: Has deviceId already redeemed any code before?
        const alreadyRedeemed = await ReferralLog.findOne({ redeemerDeviceId: deviceId });
        if (alreadyRedeemed) {
            return res.status(400).json({ success: false, message: 'This device has already redeemed a code' });
        }

        // 4. Loop Check: Has the code owner already been referred by this deviceId?
        // (If User A is trying to redeem User B's code, but User B was already referred by User A)
        const mutualReferral = await ReferralLog.findOne({
            referrerDeviceId: deviceId,
            redeemerDeviceId: referrer.deviceId
        });
        if (mutualReferral) {
            return res.status(400).json({ success: false, message: 'Mutual referrals are not allowed' });
        }

        // All checks passed!
        // Record the referral
        await ReferralLog.create({
            referrerDeviceId: referrer.deviceId,
            redeemerDeviceId: deviceId
        });

        // Award the referrer
        referrer.pendingRewards += 1; // 1 reward = 50 coins (handled in claim)
        await referrer.save();

        res.status(200).json({
            success: true,
            message: 'Referral code redeemed successfully'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/referral/claim
 * Consume pending rewards
 */
exports.claimRewards = async (req, res, next) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return res.status(400).json({ success: false, message: 'deviceId is required' });
        }

        const user = await ReferringUser.findOne({ deviceId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const rewardCount = user.pendingRewards;
        const coinsToAward = rewardCount * 50;

        // Reset rewards
        user.pendingRewards = 0;
        await user.save();

        res.status(200).json({
            success: true,
            claimedRewards: rewardCount,
            coinsAwarded: coinsToAward
        });

    } catch (error) {
        next(error);
    }
};
