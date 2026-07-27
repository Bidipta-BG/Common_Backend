const { supabaseAdmin } = require('../../config/supabaseClient');

const getTasks = async (userId, projectId, queryParams) => {
  const { data: member, error: memberError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (memberError || !member) throw new Error('Forbidden: Not an active member of this project');

  let query = supabaseAdmin.from('tasks').select('*').eq('project_id', projectId);

  if (member.role === 'admin') {
    if (queryParams.assignedTo) query = query.eq('assigned_to', queryParams.assignedTo);
    if (queryParams.status) query = query.eq('status', queryParams.status);
    if (queryParams.priority) query = query.eq('priority', queryParams.priority);
  } else {
    query = query.eq('assigned_to', userId);
    if (queryParams.status) query = query.eq('status', queryParams.status);
    if (queryParams.priority) query = query.eq('priority', queryParams.priority);
  }

  const { data, error } = await query;
  if (error) throw error;

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  
  const populatedTasks = data.map(task => {
    const assignee = usersData?.users?.find(u => u.id === task.assigned_to);
    const creator = usersData?.users?.find(u => u.id === task.created_by);
    return {
      ...task,
      assignee: assignee ? { email: assignee.email, raw_user_meta_data: assignee.user_metadata } : null,
      creator: creator ? { email: creator.email, raw_user_meta_data: creator.user_metadata } : null
    };
  });

  return populatedTasks;
};

const createTask = async (userId, projectId, taskData) => {
  const { data: member, error: memberError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (memberError || !member) throw new Error('Forbidden: Admin access required to create tasks');

  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .insert([{ ...taskData, project_id: projectId, created_by: userId }])
    .select()
    .single();

  if (taskError) throw taskError;

  await supabaseAdmin.from('task_activity_log').insert([{
    task_id: task.id,
    user_id: userId,
    action: 'task_created',
    new_value: 'Task created by admin'
  }]);

  return task;
};

const getTaskById = async (userId, taskId) => {
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError || !task) throw new Error('Task not found');

  const { data: member, error: memberError } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', task.project_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (memberError || !member) throw new Error('Forbidden');

  if (member.role !== 'admin' && task.assigned_to !== userId) {
    throw new Error('Forbidden: Access denied to this task');
  }

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  if (usersData?.users) {
    const assignee = usersData.users.find(u => u.id === task.assigned_to);
    const creator = usersData.users.find(u => u.id === task.created_by);
    
    if (assignee) {
      task.assignee = { email: assignee.email, raw_user_meta_data: assignee.user_metadata };
    }
    if (creator) {
      task.creator = { email: creator.email, raw_user_meta_data: creator.user_metadata };
    }
  }

  return task;
};

const updateTask = async (userId, taskId, updateData) => {
  const task = await getTaskById(userId, taskId);
  
  const { data: member } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', task.project_id)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (!member) throw new Error('Forbidden: Admin access required');

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin.from('task_activity_log').insert([{
    task_id: taskId,
    user_id: userId,
    action: 'task_updated',
    new_value: JSON.stringify(Object.keys(updateData))
  }]);

  return data;
};

const updateTaskStatus = async (userId, taskId, status) => {
  const task = await getTaskById(userId, taskId);

  const { data: member } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', task.project_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!member) throw new Error('Forbidden');

  if (member.role !== 'admin' && task.assigned_to !== userId) {
    throw new Error('Forbidden: Cannot change status of unassigned task');
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update({ status })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin.from('task_activity_log').insert([{
    task_id: taskId,
    user_id: userId,
    action: 'status_changed',
    new_value: status
  }]);

  return data;
};

const deleteTask = async (userId, taskId) => {
  const task = await getTaskById(userId, taskId);

  const { data: member } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', task.project_id)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .single();

  if (!member) throw new Error('Forbidden: Admin access required');

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
  return true;
};

const getTaskActivity = async (userId, taskId) => {
  const task = await getTaskById(userId, taskId);

  const { data: member } = await supabaseAdmin
    .from('project_members')
    .select('*')
    .eq('project_id', task.project_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!member) throw new Error('Forbidden');

  const { data: activities, error } = await supabaseAdmin
    .from('task_activity_log')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) throw usersError;

  const populatedActivities = activities.map(activity => {
    const user = usersData.users.find(u => u.id === activity.user_id);
    return {
      ...activity,
      user: user ? { email: user.email, raw_user_meta_data: user.user_metadata } : null
    };
  });

  return populatedActivities;
};

module.exports = {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskActivity
};
