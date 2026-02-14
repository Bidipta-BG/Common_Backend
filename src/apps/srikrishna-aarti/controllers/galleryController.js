const { PromoBanner, Image, Category, HeroSection } = require('../models');

/**
 * Helper function to format numbers like 1200 to "1.2k"
 */
const formatNumber = (num) => {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
};

/**
 * GET /api/srikrishna-aarti/gallery
 * Returns the complete gallery data with promoBanner, heroSections, and categories
 */
exports.getGalleryData = async (req, res, next) => {
    try {
        // 1. Fetch the active promo banner
        const promoBannerDoc = await PromoBanner.findOne({ isVisible: true }).sort({ createdAt: -1 });

        let promoBanner = null;
        if (promoBannerDoc) {
            promoBanner = {
                isVisible: promoBannerDoc.isVisible,
                title: promoBannerDoc.title,
                subtitle: promoBannerDoc.subtitle,
                actionText: promoBannerDoc.actionText,
                daysLeft: promoBannerDoc.daysLeft,
                targetUrl: promoBannerDoc.targetUrl,
                colors: promoBannerDoc.colors
            };
        }

        // 2. Fetch active hero sections with their images
        const heroSectionDocs = await HeroSection.find({ isActive: true })
            .sort({ order: 1 })
            .populate('imageIds');

        const heroSections = heroSectionDocs.map(section => ({
            id: section._id,
            title: section.title,
            items: section.imageIds.map(img => ({
                id: img._id,
                imageUrl: img.imageUrl,
                shares: formatNumber(img.shares),
                downloads: formatNumber(img.downloads),
                globalIndex: img.globalIndex
            }))
        }));

        // 3. Fetch active categories with their images
        const categoryDocs = await Category.find({ isActive: true }).sort({ order: 1 });

        const categories = await Promise.all(
            categoryDocs.map(async (cat) => {
                // Find all images that belong to this category
                const images = await Image.find({
                    categories: cat._id
                }).sort({ globalIndex: 1 });

                return {
                    id: cat._id,
                    title: cat.title,
                    thumbnailUrl: cat.thumbnailUrl,
                    items: images.map(img => ({
                        id: img._id,
                        imageUrl: img.imageUrl,
                        shares: formatNumber(img.shares),
                        downloads: formatNumber(img.downloads),
                        globalIndex: img.globalIndex
                    }))
                };
            })
        );

        // 4. Send the response
        res.status(200).json({
            promoBanner,
            heroSections,
            categories
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/promo-banner
 * Create a new promo banner
 */
exports.createPromoBanner = async (req, res, next) => {
    try {
        const promoBanner = await PromoBanner.create(req.body);
        res.status(201).json({
            success: true,
            data: promoBanner
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/category
 * Create a new category
 */
exports.createCategory = async (req, res, next) => {
    try {
        const category = await Category.create(req.body);
        res.status(201).json({
            success: true,
            data: category
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/hero-section
 * Create a new hero section
 */
exports.createHeroSection = async (req, res, next) => {
    try {
        const heroSection = await HeroSection.create(req.body);
        res.status(201).json({
            success: true,
            data: heroSection
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/image
 * Create a new image
 */
exports.createImage = async (req, res, next) => {
    try {
        const image = await Image.create(req.body);
        res.status(201).json({
            success: true,
            data: image
        });
    } catch (error) {
        next(error);
    }
};
