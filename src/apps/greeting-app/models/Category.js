const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
    // We change name to an object to support multiple languages
    name: {
        en: { type: String, required: true }, // English (Default)
        hi: { type: String },                // Hindi
        bn: { type: String },                // Bengali
        mr: { type: String },                // Marathi
        te: { type: String },                // Telugu
        ta: { type: String },                // Tamil
        gu: { type: String },                // Gujarati
        ur: { type: String },                // Urdu
        kn: { type: String },                // Kannada
        or: { type: String },                // Odia
        ml: { type: String },                // Malayalam
        pa: { type: String },                // Punjabi
        as: { type: String },                // Assamese
        mai: { type: String },                // Maithili
        sat: { type: String },                // Santali
        ks: { type: String },                // Kashmiri
        ne: { type: String },                // Nepali
        kok: { type: String },                // Konkani
        doi: { type: String },                // Dogri
        brx: { type: String },                // Bodo
        mni: { type: String },                // Manipuri (Meitei)
        sa: { type: String }                 // Sanskrit
    },
    slug: { type: String, required: true, unique: true },
    icon: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GreetingApp_Category', CategorySchema);