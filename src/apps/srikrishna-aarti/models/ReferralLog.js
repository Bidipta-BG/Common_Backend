const mongoose = require('mongoose');

const referralLogSchema = new mongoose.Schema({
    referrerDeviceId: {
        type: String,
        required: true,
        index: true
    },
    redeemerDeviceId: {
        type: String,
        required: true,
        unique: true, // A device can only redeem once
        index: true
    },
    redeemedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReferralLog', referralLogSchema, 'SrikrishnaAarti_ReferralLogs');
