const mongoose = require('mongoose');

const GreetingSchema = new mongoose.Schema({
    imageUrl: { type: String, required: true },
    category: { type: String, required: true },
    language: { type: String, required: true },
    tags: [String],
    shareCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GreetingApp_Greeting', GreetingSchema);