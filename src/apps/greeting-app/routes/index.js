const express = require('express');
const router = express.Router();
const greetingController = require('../controllers/greetingController');
const { validateGreeting } = require('../validators/greetingValidator');
const { upload } = require('../../../config/aws');

// --- Greeting Images ---
router.get('/images', greetingController.getGreetings);
router.get('/images/:id', greetingController.getGreetingById);
router.put('/images/:id', greetingController.updateGreeting);
router.delete('/images/:id', greetingController.deleteGreeting);

// Use ONLY this one for POSTing images
// Multer first, then Validator, then Controller
router.post(
    '/images', 
    upload.single('image'), 
    validateGreeting, 
    greetingController.createGreeting
);

// --- Categories ---
router.get('/categories', greetingController.getCategories);
router.post('/categories', greetingController.createCategory);

// --- Languages ---
router.get('/languages', greetingController.getLanguages);
router.post('/languages', greetingController.createLanguage);

module.exports = router;