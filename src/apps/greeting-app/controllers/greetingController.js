// TOP OF FILE: Import all models
const Greeting = require('../models/Greeting');
const Category = require('../models/Category');
const Language = require('../models/Language');
const PushToken = require('../models/PushToken');

// --- 1. GREETINGS (IMAGES) ---
exports.getGreetings = async (req, res, next) => {
    try {
        const { category, language } = req.query;
        let filter = { isActive: true };
        let sort = { createdAt: -1 }; // Default: Newest first

        // TOP SHARED LOGIC: 
        // If category is 'top_shared', we sort by shareCount and ignore the category filter
        if (category === 'top_shared') {
            sort = { shareCount: -1, createdAt: -1 }; 
        } else if (category) {
            filter.category = category;
        }
        
        if (language) filter.language = language;
        
        // Limit results to 50 for top_shared to keep it highly relevant
        const limit = category === 'top_shared' ? 50 : 200;

        const data = await Greeting.find(filter).sort(sort).limit(limit);
        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) { next(error); }
};

// NEW: Track Share Logic
// This increments the shareCount field by 1 whenever called
exports.trackShare = async (req, res, next) => {
    try {
        const { id } = req.params;
        const greeting = await Greeting.findByIdAndUpdate(
            id, 
            { $inc: { shareCount: 1 } }, // Atomic increment
            { new: true }
        );
        
        if (!greeting) return res.status(404).json({ success: false, message: 'Not found' });
        
        res.status(200).json({ 
            success: true, 
            message: 'Share tracked successfully', 
            shareCount: greeting.shareCount 
        });
    } catch (error) { next(error); }
};

exports.createGreeting = async (req, res, next) => {
    try {
        const { category, language } = req.body;

        // Determine image URL source: uploaded file (req.file) or provided imageUrl in body
        const imageUrl = req.file ? req.file.location : req.body.imageUrl;

        // Normalize tags: accept array or comma-separated string
        let tags = [];
        if (Array.isArray(req.body.tags)) {
            tags = req.body.tags.map(t => String(t).trim()).filter(Boolean);
        } else if (typeof req.body.tags === 'string' && req.body.tags.trim().length > 0) {
            tags = req.body.tags.split(',').map(tag => tag.trim()).filter(Boolean);
        }

        const greeting = await Greeting.create({
            imageUrl,
            category,
            language,
            tags,
            shareCount: 0, // Initialize shares at zero
            isActive: true
        });

        res.status(201).json({ success: true, data: greeting });
    } catch (error) { next(error); }
};

// --- 2. CATEGORY LOGIC ---
exports.getCategories = async (req, res, next) => {
    try {
        const categories = await Category.find({ isActive: true }).sort({ order: 1 });
        res.json({ success: true, data: categories });
    } catch (error) { next(error); }
};

exports.createCategory = async (req, res, next) => {
    try {
        const category = await Category.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) { next(error); }
};

// --- 3. LANGUAGE LOGIC ---

exports.getLanguages = async (req, res, next) => {
    try {
        const languages = await Language.find({ isActive: true });
        res.json({ 
            success: true, 
            count: languages.length, 
            data: languages 
        });
    } catch (error) { next(error); }
};

exports.createLanguage = async (req, res, next) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ success: false, message: "Language code is required" });
        }

        const language = await Language.findOneAndUpdate(
            { code: code }, 
            req.body, 
            { new: true, upsert: true, runValidators: true }
        );

        res.status(201).json({ 
            success: true, 
            message: 'Language processed successfully',
            data: language 
        });
    } catch (error) { next(error); }
};

exports.updateLanguage = async (req, res, next) => {
    try {
        const language = await Language.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );
        if (!language) return res.status(404).json({ success: false, message: 'Language not found' });
        res.status(200).json({ success: true, data: language });
    } catch (error) { next(error); }
};

// --- 4. SINGLE ITEM MANAGEMENT ---
exports.getGreetingById = async (req, res, next) => {
    try {
        const greeting = await Greeting.findById(req.params.id);
        if (!greeting) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: greeting });
    } catch (error) { next(error); }
};

exports.updateGreeting = async (req, res, next) => {
    try {
        const greeting = await Greeting.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!greeting) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: greeting });
    } catch (error) { next(error); }
};

exports.deleteGreeting = async (req, res, next) => {
    try {
        const greeting = await Greeting.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!greeting) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Greeting deactivated' });
    } catch (error) { next(error); }
};



exports.saveToken = async (req, res, next) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ 
                success: false, 
                message: "Token is required" 
            });
        }

        // Upsert logic: If the token exists, update 'lastUsed'. 
        // If it doesn't exist, create a new record.
        const updatedToken = await PushToken.findOneAndUpdate(
            { token },
            { lastUsed: Date.now() },
            { upsert: true, new: true }
        );

        res.status(200).json({ 
            success: true, 
            message: "Token saved successfully",
            data: updatedToken 
        });
    } catch (error) {
        // Pass the error to your global errorHandler
        next(error);
    }
};