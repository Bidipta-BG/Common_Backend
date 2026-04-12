const express = require('express');
const router = express.Router();
const uploadController = require('./controllers/uploadController');

// The route uses the multer middleware first, then the controller to format the response
router.post('/file', uploadController.dynamicUpload.single('file'), uploadController.handleUploadFile);

module.exports = router;
