const mongoose = require('mongoose');

const slokaSchema = new mongoose.Schema({
    chapter: {
        type: String,
        required: true
    },
    sans: {
        type: String,
        required: true
    },
    en: {
        text: { type: String, required: true },
        meaning: { type: String, required: true }
    },
    hi: {
        text: { type: String, required: true },
        meaning: { type: String, required: true }
    },
    isFeatured: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Ensure only one sloka can be featured if we decide to use a partial index, 
// but we'll handle this in the controller for more flexibility.

module.exports = mongoose.model('Sloka', slokaSchema, 'SrikrishnaAarti_Slokas');
