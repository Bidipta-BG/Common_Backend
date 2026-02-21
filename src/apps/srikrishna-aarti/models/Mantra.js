const mongoose = require('mongoose');

const mantraSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    sans: {
        type: String,
        required: true
    },
    benefit: {
        en: { type: String, required: true },
        hi: { type: String, required: true }
    },
    details: {
        en: { type: String, required: true },
        hi: { type: String, required: true }
    },
    count: {
        type: Number,
        default: 108
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Mantra', mantraSchema, 'SrikrishnaAarti_Mantras');
