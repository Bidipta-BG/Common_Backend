const mongoose = require('mongoose');

const LeadInfoSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true },
    businessName: { type: String },
    city: { type: String },
    preferredCallTime: { type: String }
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
    leadId: { type: String, unique: true },
    formType: { type: String, required: true },
    industry: { type: String },
    buildType: { type: String, enum: ['website', 'app', 'both'] },
    managementType: { type: String, enum: ['managed', 'handover'] },
    leadInfo: { type: LeadInfoSchema, required: true },
    answers: { type: mongoose.Schema.Types.Mixed },
    salesAnswers: { type: mongoose.Schema.Types.Mixed },
    readableAnswers: [{
        question: { type: String },
        answer: { type: String }
    }],
    recommendation: {
        package: { type: String },
        complexityScore: { type: Number },
        paymentPlan: { type: String },
        pricing: { type: mongoose.Schema.Types.Mixed },
        features: [{ type: String }],
        reasons: [{ type: String }]
    },
    refundPolicy: {
        deliveryWindowDays: { type: Number },
        refundDeadlineDays: { type: Number },
        refundEligible: { type: Boolean, default: true }
    },
    selection: { type: SelectionSchema },
    quotation: { type: QuotationSchema },
    followupStatus: {
        type: String,
        enum: ['Pending', 'Contacted', 'In Progress', 'Not Interested', 'Lost', 'Converted'],
        default: 'Pending'
    },
    followupDate: { type: Date },
    isCustomerConnected: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Axomitlab_Lead', LeadSchema);
