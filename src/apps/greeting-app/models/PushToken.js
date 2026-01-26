const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
    token: { 
        type: String, 
        required: true, 
        unique: true // Ensures no duplicate tokens for the same device
    },
    lastUsed: { 
        type: Date, 
        default: Date.now 
    }
}, { timestamps: true });

module.exports = mongoose.model('PushToken', pushTokenSchema);