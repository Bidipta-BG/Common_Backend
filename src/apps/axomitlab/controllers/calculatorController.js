const CalculatorConfig = require('../models/CalculatorConfig');

/**
 * Get the current calculator configuration
 * Since there is only one configuration, we return the first one found.
 */
exports.getConfig = async (req, res, next) => {
    try {
        const config = await CalculatorConfig.findOne();
        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Configuration not found. Please post an initial configuration.'
            });
        }
        res.status(200).json({
            success: true,
            data: config
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update or create the calculator configuration
 * Uses upsert logic to ensure only one document exists.
 */
exports.updateConfig = async (req, res, next) => {
    try {
        // We use findOneAndUpdate with an empty filter and upsert: true
        // This will update the existing config or create it if it doesn't exist.
        // Since we only ever want ONE config, we don't provide an ID in the filter.
        const config = await CalculatorConfig.findOneAndUpdate(
            {},
            req.body,
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        res.status(200).json({
            success: true,
            message: 'Configuration updated successfully',
            data: config
        });
    } catch (error) {
        next(error);
    }
};
