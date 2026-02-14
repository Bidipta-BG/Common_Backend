const mongoose = require('mongoose');

const promoBannerSchema = new mongoose.Schema({
    isVisible: {
        type: Boolean,
        default: true
    },
    title: {
        type: String,
        required: true
    },
    subtitle: {
        type: String,
        required: true
    },
    actionText: {
        type: String,
        required: true
    },
    daysLeft: {
        type: Number,
        required: true
    },
    targetUrl: {
        type: String,
        required: true
    },
    colors: {
        type: [String],
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PromoBanner', promoBannerSchema, 'SrikrishnaAarti_PromoBanners');
