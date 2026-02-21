const mongoose = require('mongoose');

const referringUserSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    referralCode: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    pendingRewards: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReferringUser', referringUserSchema, 'SrikrishnaAarti_ReferringUsers');
