const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true
    },
    shares: {
        type: Number,
        default: 0
    },
    downloads: {
        type: Number,
        default: 0
    },
    globalIndex: {
        type: Number,
        required: true,
        unique: true
    },
    categories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HanumanjiPuja_Category'
    }],
    isTrending: {
        type: Boolean,
        default: false
    },
    isHero: {
        type: Boolean,
        default: false
    },
    heroSection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HanumanjiPuja_HeroSection',
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('HanumanjiPuja_Image', imageSchema, 'HanumanjiPuja_Images');
