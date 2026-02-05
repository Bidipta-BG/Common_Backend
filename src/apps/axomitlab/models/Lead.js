const mongoose = require('mongoose');

const LeadInfoSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true }
}, { _id: false });

const SelectionSchema = new mongoose.Schema({
    projectType: { type: String },
    complexity: { type: String },
    addons: [{ type: String }],
    deliveryMode: { type: String },
    tenureYears: { type: Number },
    payUpfront: { type: Boolean }
}, { _id: false });

const QuotationSchema = new mongoose.Schema({
    currency: { type: String },
    totalProjectValue: { type: Number },
    upfrontFee: { type: Number },
    monthlySubscription: { type: Number },
    subscriptionDuration: { type: Number },
    deliveryTime: { type: String },
    includesMaintenance: { type: Boolean },
    maintenanceCost: { type: Number }
}, { _id: false });

const LeadSchema = new mongoose.Schema({
    formType: { type: String, required: true },
    leadInfo: { type: LeadInfoSchema, required: true },
    selection: { type: SelectionSchema },
    quotation: { type: QuotationSchema },
    followupStatus: {
        type: String,
        enum: ['Pending', 'Contacted', 'Not Interested', 'Converted'],
        default: 'Pending'
    },
    followupDate: { type: Date },
    isCustomerConnected: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Axomitlab_Lead', LeadSchema);
