const mongoose = require('mongoose');

const heroSectionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        required: true
    },
    imageIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('HeroSection', heroSectionSchema, 'SrikrishnaAarti_HeroSections');
