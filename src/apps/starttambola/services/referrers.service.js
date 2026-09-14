const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const crypto = require('crypto');

// Helper to generate unique referral code
const generateReferralCode = () => {
  return 'GT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
};

const verifyPassword = (password, hash) => {
  const [salt, key] = hash.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return key === derivedKey;
};

const createReferrer = async ({ name, email, mobile, password }) => {
  // Check if email already exists
  const { data: existing } = await supabaseAdmin
    .from('referrers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    throw new AppError('A referrer account with this email already exists.', 'CONFLICT', 409);
  }

  // Hash password using native crypto
  const passwordHash = hashPassword(password);

  // Generate unique code
  let code = generateReferralCode();
  let codeIsUnique = false;
  let attempts = 0;

  while (!codeIsUnique && attempts < 5) {
    const { data: existingCode } = await supabaseAdmin
      .from('referrers')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();
    
    if (existingCode) {
      code = generateReferralCode();
      attempts++;
    } else {
      codeIsUnique = true;
    }
  }

  if (!codeIsUnique) {
    throw new AppError('Failed to generate a unique referral code. Try again.', 'INTERNAL_ERROR', 500);
  }

  const { data, error } = await supabaseAdmin
    .from('referrers')
    .insert({
      name,
      email,
      mobile,
      password_hash: passwordHash,
      referral_code: code,
      is_active: false,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(error.message, 'SUPABASE_ERROR', 500);
  }

  return {
    referrerId: data.id,
    referralCode: data.referral_code,
  };
};

const authenticateReferrer = async ({ email, password }) => {
  const { data: referrer, error } = await supabaseAdmin
    .from('referrers')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 'SUPABASE_ERROR', 500);
  }

  if (!referrer) {
    throw new AppError('Invalid email or password.', 'UNAUTHORIZED', 401);
  }

  const isValid = verifyPassword(password, referrer.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password.', 'UNAUTHORIZED', 401);
  }

  return {
    referrerId: referrer.id,
    name: referrer.name,
    email: referrer.email,
    mobile: referrer.mobile,
    referralCode: referrer.referral_code,
    isActive: referrer.is_active,
  };
};

const validateReferralCode = async (code) => {
  const { data: referrer, error } = await supabaseAdmin
    .from('referrers')
    .select('id, name, is_active')
    .eq('referral_code', code)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 'SUPABASE_ERROR', 500);
  }

  if (!referrer || !referrer.is_active) {
    return { valid: false };
  }

  return {
    valid: true,
    referrerFirstName: referrer.name.split(' ')[0],
  };
};

const getDashboardStats = async (referrerId) => {
  const { data: referrer, error } = await supabaseAdmin
    .from('referrers')
    .select('*')
    .eq('id', referrerId)
    .single();

  if (error) throw new AppError(error.message, 'SUPABASE_ERROR', 500);

  const { data: history, error: historyError } = await supabaseAdmin
    .from('referrals')
    .select('id, tenant_id, plan, amount_paid, points_earned, status, created_at, tenants(business_name, owner_name)')
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false });

  if (historyError) throw new AppError(historyError.message, 'SUPABASE_ERROR', 500);

  const formattedHistory = history.map(row => ({
    id: row.id,
    customerFirstName: row.tenants?.owner_name?.split(' ')[0] || row.tenants?.business_name || 'Unknown',
    date: row.created_at,
    plan: row.plan,
    amountPaid: row.amount_paid || 0,
    pointsEarned: row.points_earned || 0,
    status: row.status
  }));

  return {
    referrer: {
      name: referrer.name,
      email: referrer.email,
      mobile: referrer.mobile,
      referralCode: referrer.referral_code,
      isActive: referrer.is_active,
    },
    stats: {
      totalPoints: referrer.referral_points_total,
      freeMonthsEarned: referrer.free_months_earned,
      freeMonthsUsed: referrer.free_months_used,
      pointsToNextMonth: 10 - (referrer.referral_points_total % 10)
    },
    referrals: formattedHistory
  };
};

const confirmReferral = async ({ tenantId, orderId }) => {
  // Find pending referral
  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) throw new AppError(error.message, 'SUPABASE_ERROR', 500);
  if (!referral) return { message: 'No pending referral found for this tenant.' };

  // Update referral status to successful
  const points = referral.plan === 'yearly' ? 10 : 1;
  const amountPaid = referral.plan === 'yearly' ? 25200 : 3600; // Hardcoded based on plan

  const { error: updateError } = await supabaseAdmin
    .from('referrals')
    .update({
      status: 'successful',
      order_id: orderId,
      amount_paid: amountPaid,
      points_earned: points,
      confirmed_at: new Date().toISOString()
    })
    .eq('id', referral.id);

  if (updateError) throw new AppError(updateError.message, 'SUPABASE_ERROR', 500);

  // Update referrer stats
  // We need to fetch current stats first to increment safely, 
  // or use RPC. Doing JS increment here for simplicity.
  const { data: referrer, error: refError } = await supabaseAdmin
    .from('referrers')
    .select('referral_points_total, free_months_earned')
    .eq('id', referral.referrer_id)
    .single();

  if (refError) throw new AppError(refError.message, 'SUPABASE_ERROR', 500);

  const newTotalPoints = referrer.referral_points_total + points;
  const newFreeMonths = Math.floor(newTotalPoints / 10); // 10 points = 1 free month

  await supabaseAdmin
    .from('referrers')
    .update({
      referral_points_total: newTotalPoints,
      free_months_earned: newFreeMonths
    })
    .eq('id', referral.referrer_id);

  return { success: true };
};

module.exports = {
  createReferrer,
  authenticateReferrer,
  validateReferralCode,
  getDashboardStats,
  confirmReferral
};
