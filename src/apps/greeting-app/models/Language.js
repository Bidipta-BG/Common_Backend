const mongoose = require('mongoose');

const LanguageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nativeName: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },

    // Scalable object for all UI translations
    labels: {
        // Language Selection Screen
        default_lang: { type: String, default: "Default Language" },
        change_lang: { type: String, default: "Or Change Language Below" },
        continue_btn: { type: String, default: "Continue" },
        welcome_msg: { type: String, default: "Choose your preferred language" },

        // Category Selection Screen
        select_category: { type: String, default: "Select Category" },

        // Image Grid Screen
        choose_image: { type: String, default: "Choose Image" },
        no_regional_msg: { type: String, default: "No regional greetings found yet for this category." },
        go_back: { type: String, default: "Go Back" },

        // Editor Screen
        edit_greeting: { type: String, default: "Edit Greeting" },
        message_btn: { type: String, default: "Message" },
        favourite_btn: { type: String, default: "Favourite" },
        whatsapp_btn: { type: String, default: "WhatsApp" },
        more_btn: { type: String, default: "More" },
        type_placeholder: { type: String, default: "Type your message..." },
        no_favorites_msg: { type: String, default: "No favorites saved yet." },
        favorites_limit_msg: { type: String, default: "You can save up to 10 images." },
        favorites_title: { type: String, default: "My Favorites" }
    }
}, { timestamps: true });

module.exports = mongoose.model('GreetingApp_Language', LanguageSchema);