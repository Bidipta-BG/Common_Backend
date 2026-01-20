const mongoose = require('mongoose');

const LanguageSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Hindi"
    nativeName: { type: String, required: true }, // e.g., "हिंदी"
    code: { type: String, required: true, unique: true }, // e.g., "hi"
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GreetingApp_Language', LanguageSchema);