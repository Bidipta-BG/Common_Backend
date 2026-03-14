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
        ref: 'HanumanjiPuja_Image'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('HanumanjiPuja_HeroSection', heroSectionSchema, 'HanumanjiPuja_HeroSections');
