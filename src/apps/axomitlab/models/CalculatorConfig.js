const mongoose = require('mongoose');

const LabelSchema = new mongoose.Schema({
    totalProject: { type: String, default: 'Total Project Value' },
    agreement: { type: String, default: 'Upfront Agreement' },
    emi: { type: String, default: 'Balance via EMI' },
    amc: { type: String, default: 'Support & Maintenance' }
}, { _id: false });

const ProjectTypeSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    desc: { type: String },
    multiplier: { type: Number, required: true },
    weeks: { type: Number, required: true }
}, { _id: false });

const ComplexitySchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    desc: { type: String },
    multiplier: { type: Number, required: true },
    weeks: { type: Number, required: true }
}, { _id: false });

const DeliveryModeSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    multiplier: { type: Number, required: true },
    weekReduction: { type: Number },
    tag: { type: String }
}, { _id: false });

const PaymentTenureSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    value: { type: Number, required: true },
    threshold: { type: Number, required: true }
}, { _id: false });

const SubPowerUpSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    cost: { type: Number, required: true },
    time: { type: Number, required: true }
}, { _id: false });

const PowerUpSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    info: { type: String },
    baseCost: { type: Number, required: true },
    baseTime: { type: Number, required: true },
    subs: [SubPowerUpSchema]
}, { _id: false });

const CalculatorConfigSchema = new mongoose.Schema({
    basePrice: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    upfrontDiscount: { type: Number, default: 0.10 },
    upfrontAgreementPercentage: { type: Number, default: 0.10 },
    estimationBuffer: { type: Number, default: 0.20 },
    maintenancePercentage: { type: Number, default: 0.15 },
    deliveryExpressMultiplier: { type: Number, default: 1.20 },
    deliveryExpressTimeFactor: { type: Number, default: 0.70 },
    minDurationFactor: { type: Number, default: 0.60 },
    labels: LabelSchema,
    projectTypes: [ProjectTypeSchema],
    complexities: [ComplexitySchema],
    deliveryModes: [DeliveryModeSchema],
    paymentTenures: [PaymentTenureSchema],
    powerUps: [PowerUpSchema]
}, { timestamps: true });

module.exports = mongoose.model('Axomitlab_CalculatorConfig', CalculatorConfigSchema);
