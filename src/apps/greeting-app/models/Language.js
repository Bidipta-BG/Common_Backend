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
        favorites_title: { type: String, default: "My Favorites" },
        unlock_feature: { type: String, default: "Unlock Feature" },
        watch_ad_msg: { type: String, default: "Watch a video to add a second text layer for this session." },
        cancel_btn: { type: String, default: "Cancel" },
        watch_btn: { type: String, default: "Watch Ad" },
        add_text_1: { type: String, default: "Add Text 1" },
        add_text_2: { type: String, default: "Add Text 2" },
        unlock_text_2: { type: String, default: "Unlock Text 2" },
        done_btn: { type: String, default: "DONE" },
        tab_color: { type: String, default: "COLOR" },
        tab_font: { type: String, default: "FONT" },
        tab_size: { type: String, default: "SIZE" },
        ad_loading: { type: String, default: "Video is not ready yet, trying to reload..." },
    }
}, { timestamps: true });   

module.exports = mongoose.model('GreetingApp_Language', LanguageSchema);