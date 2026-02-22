const { AppConfig } = require('../models');

/**
 * GET /api/srikrishna-aarti/system/version-check
 * Returns the current app configuration (versioning, maintenance, etc.)
 */
exports.getVersionCheck = async (req, res, next) => {
    try {
        let config = await AppConfig.findOne();

        // If no config exists, create a default one
        if (!config) {
            config = await AppConfig.create({
                latestVersion: '1.0.0',
                minRequiredVersion: '1.0.0',
                isForceUpdate: false,
                updateTitle: 'New Blessings Available!',
                updateMessage: 'We have added new beautiful wallpapers and faster chanting. Please update to enjoy the best experience.',
                playStoreUrl: 'https://play.google.com/store/apps/details?id=com.thevibecoder.shrikrishnapuja',
                appStoreUrl: '',
                maintenanceMode: false,
                maintenanceMessage: 'App is currently under maintenance for Divine upgrades. Please check back in 1 hour.'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                latestVersion: config.latestVersion,
                minRequiredVersion: config.minRequiredVersion,
                isForceUpdate: config.isForceUpdate,
                updateTitle: config.updateTitle,
                updateMessage: config.updateMessage,
                playStoreUrl: config.playStoreUrl,
                appStoreUrl: config.appStoreUrl,
                maintenanceMode: config.maintenanceMode,
                maintenanceMessage: config.maintenanceMessage
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/system/version-check
 * Updates the app configuration
 */
exports.updateVersionConfig = async (req, res, next) => {
    try {
        const updateData = req.body;

        let config = await AppConfig.findOne();

        if (config) {
            // Update existing
            config = await AppConfig.findByIdAndUpdate(
                config._id,
                updateData,
                { new: true, runValidators: true }
            );
        } else {
            // Create new
            config = await AppConfig.create(updateData);
        }

        res.status(200).json({
            success: true,
            message: 'App configuration updated successfully.',
            data: config
        });

    } catch (error) {
        next(error);
    }
};
