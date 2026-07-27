const { supabaseAdmin } = require('../../config/supabaseClient');

const getMembers = async (projectId) => {
  const { data: members, error } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw error;

  // Fetch users manually to avoid foreign key relation requirements across schemas
  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (usersError) throw usersError;

  const populatedMembers = members.map(member => {
    const user = usersData.users.find(u => u.id === member.user_id);
    return {
      ...member,
      user: user ? { email: user.email, raw_user_meta_data: user.user_metadata } : null
    };
  });

  return populatedMembers;
};

const inviteMember = async (userId, projectId, invitedEmail, role = 'member') => {
  // Check if caller is admin
  const { data: callerMember, error: callerError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (callerError || !callerMember) throw new Error('Forbidden: Admin access required');

  // Find user by email in auth.users
  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) throw usersError;

  const invitedUser = usersData.users.find(u => u.email === invitedEmail);

  if (invitedUser) {
    const { data, error } = await supabaseAdmin
      .from('project_members')
      .insert([{
        project_id: projectId,
        user_id: invitedUser.id,
        invited_email: invitedEmail,
        role: role,
        status: 'active'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // User doesn't exist, so we will create a fully verified account for them automatically
    // to completely skip the email invitation and sign-up form flow.
    const defaultPassword = 'Password123!';
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: invitedEmail,
      password: defaultPassword,
      email_confirm: true, // This skips the email verification step entirely!
      user_metadata: {
        full_name: invitedEmail.split('@')[0] // Give them a default name
      }
    });

    if (createError) throw createError;

    const { data, error } = await supabaseAdmin
      .from('project_members')
      .insert([{
        project_id: projectId,
        user_id: newUser.user.id,
        invited_email: invitedEmail,
        role: role,
        status: 'active' // Instantly active since the account is created
      }])
      .select()
      .single();

    if (error) throw error;
    
    // We append a note about the default password so the frontend could potentially show it
    return { ...data, default_password_created: defaultPassword };
  }
};

const updateMemberRole = async (userId, projectId, memberId, newRole) => {
  const { data: callerMember, error: callerError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (callerError || !callerMember) throw new Error('Forbidden: Admin access required');

  const { data, error } = await supabaseAdmin
    .from('project_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('project_id', projectId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

const removeMember = async (userId, projectId, memberId) => {
  const { data: callerMember, error: callerError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (callerError || !callerMember) throw new Error('Forbidden: Admin access required');

  const { error } = await supabaseAdmin
    .from('project_members')
    .delete()
    .eq('id', memberId)
    .eq('project_id', projectId);

  if (error) throw error;
  return true;
};

module.exports = {
  getMembers,
  inviteMember,
  updateMemberRole,
  removeMember
};
