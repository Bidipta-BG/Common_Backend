const Lead = require('../models/Lead');

// Create a new lead
exports.createLead = async (req, res) => {
    try {
        const { formType, leadInfo } = req.body;

        // Basic validation — email is optional (user may not provide it)
        if (!formType || !leadInfo || !leadInfo.name || !leadInfo.phone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: formType, name, or phone'
            });
        }

        const newLead = new Lead(req.body);
        const savedLead = await newLead.save();

        res.status(201).json({
            success: true,
            message: 'Lead captured successfully',
            data: savedLead
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating lead',
            error: error.message
        });
    }
};

// Get all leads (for admin dashboard)
// Sorted by creation date descending
exports.getAllLeads = async (req, res) => {
    try {
        const leads = await Lead.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: leads.length,
            data: leads
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching leads',
            error: error.message
        });
    }
};

// Update lead status and follow-up details
exports.updateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { followupStatus, followupDate, isCustomerConnected } = req.body;

        const updateData = {};
        if (followupStatus) updateData.followupStatus = followupStatus;
        if (followupDate) updateData.followupDate = followupDate;
        if (typeof isCustomerConnected !== 'undefined') updateData.isCustomerConnected = isCustomerConnected;

        const updatedLead = await Lead.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedLead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Lead updated successfully',
            data: updatedLead
        });
    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating lead',
            error: error.message
        });
    }
};

// Get a single lead by ID
exports.getLeadById = async (req, res) => {
    try {
        const { id } = req.params;
        const lead = await Lead.findById(id);
        
        if (!lead) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        res.status(200).json({
            success: true,
            data: lead
        });
    } catch (error) {
        console.error('Error fetching lead by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching lead',
            error: error.message
        });
    }
};

// Full replacement of lead data (used for sales edit mode)
exports.replaceLead = async (req, res) => {
    try {
        const { id } = req.params;
        // Don't overwrite followup status accidentally if not sent
        const updateData = req.body;

        const updatedLead = await Lead.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedLead) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Lead completely updated',
            data: updatedLead
        });
    } catch (error) {
        console.error('Error replacing lead:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while replacing lead',
            error: error.message
        });
    }
};
