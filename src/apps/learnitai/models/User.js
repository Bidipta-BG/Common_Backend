const mongoose = require('mongoose');

const learnitaiUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    password: { type: String }, // Hashed password
    quizData: { type: Object }, // To store all the quiz answers
    paymentStatus: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LearnitaiUser', learnitaiUserSchema);
