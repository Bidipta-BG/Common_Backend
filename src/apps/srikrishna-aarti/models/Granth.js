const mongoose = require('mongoose');

const granthSchema = new mongoose.Schema({
    bookId: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    titleHi: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    descriptionHi: {
        type: String,
        required: true
    },
    image_url: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Granth', granthSchema, 'SriKrishnaAarti_Granths');
