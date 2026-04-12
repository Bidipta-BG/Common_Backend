const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3 } = require('../../../config/aws');

// Setup multer to upload directly to S3
const dynamicUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Get folder passed from form-data (or use a default 'uploads' folder)
            const folder = req.body.folder ? req.body.folder.trim().replace(/\/+$/, '') : 'uploads';
            
            // Clean the original filename and add timestamp
            const cleanFileName = file.originalname.split('/').pop().split('?')[0] || 'uploaded_file';
            const uniqueFileName = `${Date.now()}-${cleanFileName}`;
            
            // Final S3 path: {folder}/{fileName}
            cb(null, `${folder}/${uniqueFileName}`);
        },
    }),
});

/**
 * Controller to handle the upload response
 * The actual file upload is handled by the multer middleware above
 */
const handleUploadFile = (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file was uploaded. Ensure you are sending form-data with a "file" field.' 
            });
        }

        // multer-s3 attaches the final 'location' (the public URL) to req.file
        res.status(200).json({
            success: true,
            data: {
                message: 'File uploaded successfully',
                fileUrl: req.file.location,
                key: req.file.key,
                originalName: req.file.originalname
            }
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        next(error);
    }
};

module.exports = {
    dynamicUpload,
    handleUploadFile,
};
