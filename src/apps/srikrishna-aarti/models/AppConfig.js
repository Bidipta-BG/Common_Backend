const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
    latestVersion: {
        type: String,
        required: true,
        default: '1.0.0'
    },
    minRequiredVersion: {
        type: String,
        required: true,
        default: '1.0.0'
    },
    isForceUpdate: {
        type: Boolean,
        default: false
    },
    updateTitle: {
        type: String,
        default: 'New Update Available'
    },
    updateMessage: {
        type: String,
        default: 'Please update to the latest version for the best experience.'
    },
    playStoreUrl: {
        type: String,
        default: ''
    },
    appStoreUrl: {
        type: String,
        default: ''
    },
    maintenanceMode: {
        type: Boolean,
        default: false
    },
    maintenanceMessage: {
        type: String,
        default: 'The app is currently under maintenance. Please check back later.'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AppConfig', appConfigSchema, 'SrikrishnaAarti_AppConfigs');
