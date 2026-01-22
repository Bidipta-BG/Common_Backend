// TOP OF FILE: Import all models
const Greeting = require('../models/Greeting');
const Category = require('../models/Category');
const Language = require('../models/Language');

// --- 1. GREETINGS (IMAGES) ---
exports.getGreetings = async (req, res, next) => {
    try {
        const { category, language } = req.query;
        let filter = { isActive: true };
        
        if (category) filter.category = category;
        if (language) filter.language = language;
        
        const data = await Greeting.find(filter).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) { next(error); }
};

exports.createGreeting = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file uploaded' });
        }

        const { category, language, tags } = req.body;

        const greeting = await Greeting.create({
            imageUrl: req.file.location,
            category,
            language,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
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

// --- 3. LANGUAGE LOGIC (Updated & Scalable) ---

// Get all languages with their bilingual labels
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

// UPSERT LOGIC: Create or Update language based on code
// This prevents the "E11000 duplicate key error"
exports.createLanguage = async (req, res, next) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ success: false, message: "Language code is required" });
        }

        // upsert: true means if 'hi' exists, update it. If not, create it.
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

// Dedicated Update by ID (for admin use)
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