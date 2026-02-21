const mongoose = require('mongoose');

const astroInterestSchema = new mongoose.Schema({
    interested: {
        type: Boolean,
        required: true
    },
    language: {
        type: String,
        required: true,
        enum: ['en', 'hi']
    },
    timestamp: {
        type: Date,
        required: true
    },
    deviceId: {
        type: String,
        index: true,
        unique: true,
        sparse: true // Allow multiple nulls but unique strings
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AstroInterest', astroInterestSchema, 'SrikrishnaAarti_AstroInterests');
