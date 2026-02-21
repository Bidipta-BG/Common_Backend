const { Sloka } = require('../models');

/**
 * GET /api/srikrishna-aarti/daily-slokas
 * Returns the featured sloka and the complete list of slokas
 */
exports.getDailySlokas = async (req, res, next) => {
    try {
        const allSlokasDocs = await Sloka.find().sort({ createdAt: -1 });

        // Map the docs to the requested format
        const allSlokas = allSlokasDocs.map(sloka => ({
            id: sloka._id,
            chapter: sloka.chapter,
            sans: sloka.sans,
            en: sloka.en,
            hi: sloka.hi
        }));

        // Find the featured one (or take the first one if none is marked)
        const featuredSlokaDoc = allSlokasDocs.find(s => s.isFeatured) || allSlokasDocs[0];

        let featuredSloka = null;
        if (featuredSlokaDoc) {
            featuredSloka = {
                id: featuredSlokaDoc._id,
                chapter: featuredSlokaDoc.chapter,
                sans: featuredSlokaDoc.sans,
                en: featuredSlokaDoc.en,
                hi: featuredSlokaDoc.hi
            };
        }

        res.status(200).json({
            success: true,
            data: {
                featuredSloka,
                allSlokas
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/daily-slokas
 * Add a new sloka or update an existing one
 */
exports.updateSlokas = async (req, res, next) => {
    try {
        const { id, chapter, sans, en, hi, isFeatured } = req.body;

        // If this sloka is becoming the featured one, unset any others
        if (isFeatured) {
            await Sloka.updateMany({ isFeatured: true }, { isFeatured: false });
        }

        let sloka;
        if (id) {
            // Update existing
            sloka = await Sloka.findByIdAndUpdate(
                id,
                { chapter, sans, en, hi, isFeatured },
                { new: true, runValidators: true }
            );
        } else {
            // Create new
            sloka = await Sloka.create({
                chapter,
                sans,
                en,
                hi,
                isFeatured
            });
        }

        res.status(id ? 200 : 201).json({
            success: true,
            message: id ? 'Sloka updated successfully.' : 'Sloka added successfully.',
            data: sloka
        });

    } catch (error) {
        next(error);
    }
};
