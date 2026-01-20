// TOP OF FILE: You MUST import all models you use in this controller
const Greeting = require('../models/Greeting');
const Category = require('../models/Category');
const Language = require('../models/Language');

// 1. Get Greetings (Images)
exports.getGreetings = async (req, res, next) => {
    try {
        const { category, language } = req.query;
        let filter = { isActive: true };
        
        // If user sends ?category=birthday, filter by that slug
        if (category) filter.category = category;
        // If user sends ?language=hi, filter by that code
        if (language) filter.language = language;
        
        const data = await Greeting.find(filter).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) { next(error); }
};

// 2. Create Greeting
// src/apps/greeting-app/controllers/greetingController.js

exports.createGreeting = async (req, res, next) => {
    try {
        // 1. Check if the file exists (Multer puts it in req.file)
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No image file uploaded' 
            });
        }

        // 2. Extract data from the request
        const { category, language, tags } = req.body;

        // 3. Create the database record
        const greeting = await Greeting.create({
            imageUrl: req.file.location, // This is the S3 URL provided by multer-s3
            category: category,
            language: language,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            isActive: true
        });

        // 4. Send success response
        res.status(201).json({ 
            success: true, 
            data: greeting 
        });

    } catch (error) { 
        // If it fails here, the error might be a Mongoose Validation error
        next(error); 
    }
};

// 3. Category Logic
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

// 4. Language Logic
exports.getLanguages = async (req, res, next) => {
    try {
        const languages = await Language.find({ isActive: true });
        res.json({ success: true, data: languages });
    } catch (error) { next(error); }
};

exports.createLanguage = async (req, res, next) => {
    try {
        const language = await Language.create(req.body);
        res.status(201).json({ success: true, data: language });
    } catch (error) { next(error); }
};

// 5. Single Item Management
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
        // Soft delete: keep the data but hide it from the app
        const greeting = await Greeting.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!greeting) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Greeting deactivated' });
    } catch (error) { next(error); }
};