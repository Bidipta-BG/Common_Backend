const { supabaseAdmin } = require('../../config/supabaseClient');

const getMyProjects = async (userId) => {
  // User is creator OR active project_member
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select(`
      *,
      project_members!inner(user_id, status, role)
    `)
    .eq('project_members.user_id', userId)
    .eq('project_members.status', 'active');
  
  if (error) throw error;
  return data;
};

const createProject = async (userId, projectData) => {
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .insert([{ ...projectData, created_by: userId }])
    .select()
    .single();

  if (projectError) throw projectError;

  const { error: memberError } = await supabaseAdmin
    .from('project_members')
    .insert([{
      project_id: project.id,
      user_id: userId,
      role: 'admin',
      status: 'active'
    }]);

  if (memberError) throw memberError;

  return project;
};

const getProjectById = async (userId, projectId) => {
  const { data: member, error: memberError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (memberError || !member) throw new Error('Forbidden: Project not found or access denied');

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) throw error;
  return data;
};

const updateProject = async (userId, projectId, updateData) => {
  const { data: member, error: memberError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (memberError || !member) throw new Error('Forbidden: Admin access required');

  const { data, error } = await supabaseAdmin
    .from('projects')
    .update(updateData)
    .eq('id', projectId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

const deleteProject = async (userId, projectId) => {
  const { data: project, error: getError } = await supabaseAdmin
    .from('projects')
    .select('created_by')
    .eq('id', projectId)
    .single();

  if (getError) throw getError;
  if (!project) throw new Error('Project not found');
  if (project.created_by !== userId) throw new Error('Forbidden: Only creator can delete');

  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
  return true;
};

module.exports = {
  getMyProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject
};
