const mongoose = require('mongoose');

const AppConfigSchema = new mongoose.Schema({
    androidMinVersion: { type: String, default: '1.0.0' },
    iosMinVersion: { type: String, default: '1.0.0' },
    updateUrl: { type: String, default: '' },
    forceUpdate: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false }
}, { timestamps: true });

// Prevent multiple configs by ensuring only one document exists realistically, 
// though we usually just fetch the first one.
module.exports = mongoose.model('GreetingApp_AppConfig', AppConfigSchema);
