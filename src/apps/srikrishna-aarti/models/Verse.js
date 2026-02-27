const mongoose = require('mongoose');

const verseSchema = new mongoose.Schema({
    chapter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chapter',
        required: true
    },
    verseId: {
        type: String,
        required: true,
        unique: true
    },
    bookId: {
        type: String,
        required: true
    },
    chapterIndex: {
        type: Number,
        required: true
    },
    index: {
        type: Number,
        required: true
    },
    chapterText: {
        type: String,
        required: true
    },
    chapterTextHi: {
        type: String,
        required: true
    },
    sans: {
        type: String,
        required: true
    },
    en: {
        text: { type: String, required: true },
        meaning: { type: String, required: true },
        explanation: { type: String, required: true },
        lessons: { type: String, required: true }
    },
    hi: {
        text: { type: String, required: true },
        meaning: { type: String, required: true },
        explanation: { type: String, required: true },
        lessons: { type: String, required: true }
    },
    timer: {
        type: Number,
        default: 180
    }
}, {
    timestamps: true
});

// Compound index to ensure uniqueness of verse index within a chapter of a book
verseSchema.index({ bookId: 1, chapterIndex: 1, index: 1 }, { unique: true });

module.exports = mongoose.model('Verse', verseSchema, 'SriKrishnaAarti_Verses');
