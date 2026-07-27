const User = require('../models/User');
const crypto = require('crypto');

exports.saveQuizAndPayment = async (req, res) => {
    try {
        const { name, email, phone, quizData, paymentStatus } = req.body;
        
        let user = await User.findOne({ email });
        if (user) {
            user.name = name;
            if (phone) user.phone = phone;
            if (quizData) user.quizData = quizData;
            if (paymentStatus) user.paymentStatus = paymentStatus;
            await user.save();
        } else {
            user = await User.create({ name, email, phone, quizData, paymentStatus });
        }
        
        // Return whether password is set or not
        const isPasswordSet = !!user.password;
        
        res.status(200).json({ success: true, isPasswordSet, user });
    } catch (error) {
        console.error('Error saving quiz/payment data:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.setPassword = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Hash the password
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        user.password = hash; 
        await user.save();
        
        res.status(200).json({ success: true, message: 'Password set successfully' });
    } catch (error) {
        console.error('Error setting password:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (user.password !== hash) {
            return res.status(401).json({ success: false, message: 'Invalid password' });
        }
        
        res.status(200).json({ success: true, user, message: 'Login successful' });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
