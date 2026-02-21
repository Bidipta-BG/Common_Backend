const { Mantra } = require('../models');

/**
 * GET /api/srikrishna-aarti/mantras
 * Returns all mantras
 */
exports.getMantras = async (req, res, next) => {
    try {
        const mantras = await Mantra.find().sort({ createdAt: 1 });

        const formattedMantras = mantras.map(m => ({
            id: m._id,
            title: m.title,
            sans: m.sans,
            benefit: m.benefit,
            details: m.details,
            count: m.count
        }));

        res.status(200).json({
            success: true,
            data: formattedMantras
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/mantras
 * Add a new mantra or update an existing one
 */
exports.updateMantras = async (req, res, next) => {
    try {
        const { id, title, sans, benefit, details, count } = req.body;

        let mantra;
        if (id) {
            // Update existing
            mantra = await Mantra.findByIdAndUpdate(
                id,
                { title, sans, benefit, details, count },
                { new: true, runValidators: true }
            );
        } else {
            // Create new
            mantra = await Mantra.create({
                title,
                sans,
                benefit,
                details,
                count
            });
        }

        res.status(id ? 200 : 201).json({
            success: true,
            message: id ? 'Mantra updated successfully.' : 'Mantra added successfully.',
            data: mantra
        });

    } catch (error) {
        next(error);
    }
};
