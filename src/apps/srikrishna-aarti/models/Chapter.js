const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema({
    granth: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Granth',
        required: true
    },
    bookId: {
        type: String,
        required: true
    },
    index: {
        type: Number,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    titleHi: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Compound index to ensure uniqueness of chapter index within a book
chapterSchema.index({ bookId: 1, index: 1 }, { unique: true });

module.exports = mongoose.model('Chapter', chapterSchema, 'SriKrishnaAarti_Chapters');
