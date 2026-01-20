// Add this at the very top to ensure variables are loaded before S3Client initializes
require('dotenv').config(); 

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multerS3({
        s3: s3,
        // Use a fallback or console.log to debug
        bucket: process.env.S3_BUCKET_NAME, 
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Correcting key logic to handle missing body fields during init
            const language = req.body.language || 'general';
            const category = req.body.category || 'misc';
            const fileName = `${Date.now()}-${file.originalname}`;
            cb(null, `greeting-app/${language}/${category}/${fileName}`);
        },
    }),
});

module.exports = { upload };