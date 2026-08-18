const { supabaseAdmin, supabase } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');

// ─── POST /password/update ───────────────────────────────────────────────
// Verifies old password and updates to new password.
// Protected by requireAuth middleware.

const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.auth?.userId;

    if (!userId) {
      return next(new AppError('Unauthorized', 'UNAUTHORIZED', 401));
    }
    
    if (!oldPassword || !newPassword) {
      return next(new AppError('oldPassword and newPassword are required', 'BAD_REQUEST', 400));
    }
    
    if (newPassword.length < 6) {
      return next(new AppError('New password must be at least 6 characters long', 'BAD_REQUEST', 400));
    }

    // Step 1: Fetch user's email using Admin client to perform verification
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      return next(new AppError('User not found', 'NOT_FOUND', 404));
    }
    const email = userData.user.email;

    // Step 2: Verify old password using signInWithPassword
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPassword,
    });

    if (signInError) {
      return next(new AppError('Incorrect old password', 'UNAUTHORIZED', 401));
    }

    // Step 3: Update to new password using Admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return next(new AppError(`Failed to update password: ${updateError.message}`, 'UPDATE_FAILED', 500));
    }

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return next(err);
  }
};

module.exports = { updatePassword };
