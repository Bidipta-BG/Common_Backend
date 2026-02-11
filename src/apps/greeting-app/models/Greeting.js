const mongoose = require('mongoose');

const TextLayerSchema = new mongoose.Schema({
    id: { type: String, required: true },
    text: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    fontSize: { type: Number, required: true },
    color: { type: String, default: '#FFFFFF' },
    fontFamily: { type: String, default: 'System' }
}, { _id: false });

const GreetingSchema = new mongoose.Schema({
    imageUrl: { type: String, required: true },
    category: { type: String, required: true },
    language: { type: String, required: true },
    tags: [String],
    shareCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    // Template Feature Fields
    isTemplate: { type: Boolean, default: false },
    textLayers: [TextLayerSchema]
}, { timestamps: true });


module.exports = mongoose.model('GreetingApp_Greeting', GreetingSchema);