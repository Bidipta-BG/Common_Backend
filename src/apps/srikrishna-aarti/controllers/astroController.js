const { AstroInterest } = require('../models');

/**
 * POST /api/srikrishna-aarti/astro-interest
 * Records user interest in astrology features
 */
exports.recordAstroInterest = async (req, res, next) => {
    try {
        const { interested, language, timestamp, deviceId } = req.body;

        // Simple validation
        if (interested === undefined || !language || !timestamp) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: interested, language, and timestamp are required.'
            });
        }

        let astroInterest;

        if (deviceId) {
            // Upsert based on deviceId
            astroInterest = await AstroInterest.findOneAndUpdate(
                { deviceId },
                { interested, language, timestamp },
                { upsert: true, new: true, runValidators: true }
            );
        } else {
            // Just create if no deviceId
            astroInterest = await AstroInterest.create({
                interested,
                language,
                timestamp,
                deviceId
            });
        }

        res.status(astroInterest.wasNew === false ? 200 : 201).json({
            success: true,
            message: deviceId ? 'Astro interest updated/recorded successfully.' : 'Astro interest recorded successfully.',
            data: astroInterest
        });
    } catch (error) {
        next(error);
    }
};
