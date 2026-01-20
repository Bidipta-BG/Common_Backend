exports.validateGreeting = (req, res, next) => {
    // When using form-data, text fields are in req.body
    // The file is in req.file (handled by multer)
    const { category, language } = req.body;
    
    const errors = [];

    // Check for the file instead of imageUrl string
    if (!req.file && !req.body.imageUrl) errors.push("Image file or imageUrl is required");
    if (!category) errors.push("category is required");
    if (!language) errors.push("language is required");

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: "Validation Failed",
            errors: errors
        });
    }

    next();
};