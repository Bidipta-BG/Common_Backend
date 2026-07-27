const { supabaseAdmin } = require('../../config/supabaseClient');

const getComments = async (userId, taskId) => {
  // First, verify access to the task
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('project_id')
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

  const { data: comments, error } = await supabaseAdmin
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) throw usersError;

  const populatedComments = comments.map(comment => {
    const user = usersData.users.find(u => u.id === comment.user_id);
    return {
      ...comment,
      user: user ? { email: user.email, raw_user_meta_data: user.user_metadata } : null
    };
  });

  return populatedComments;
};

const addComment = async (userId, taskId, commentData) => {
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('project_id')
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

  if (memberError || !member) throw new Error('Forbidden: Active member access required');

  const { data, error } = await supabaseAdmin
    .from('task_comments')
    .insert([{
      ...commentData,
      task_id: taskId,
      user_id: userId
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

const editComment = async (userId, taskId, commentId, updateData) => {
  const { data: comment, error: commentError } = await supabaseAdmin
    .from('task_comments')
    .select('*')
    .eq('id', commentId)
    .eq('task_id', taskId)
    .single();

  if (commentError || !comment) throw new Error('Comment not found');
  if (comment.user_id !== userId) throw new Error('Forbidden: Only the author can edit');

  const { data, error } = await supabaseAdmin
    .from('task_comments')
    .update({
      content: updateData.content,
      attachments: updateData.attachments,
      is_edited: true
    })
    .eq('id', commentId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

const deleteComment = async (userId, taskId, commentId) => {
  const { data: comment, error: commentError } = await supabaseAdmin
    .from('task_comments')
    .select('*')
    .eq('id', commentId)
    .eq('task_id', taskId)
    .single();

  if (commentError || !comment) throw new Error('Comment not found');

  if (comment.user_id !== userId) {
    // Check if admin
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('project_id')
      .eq('id', taskId)
      .single();

    const { data: member } = await supabaseAdmin
      .from('project_members')
      .select('*')
      .eq('project_id', task?.project_id)
      .eq('user_id', userId)
      .eq('role', 'admin')
      .eq('status', 'active')
      .single();

    if (!member) throw new Error('Forbidden: Admin access or ownership required to delete');
  }

  const { error } = await supabaseAdmin
    .from('task_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
  return true;
};

module.exports = {
  getComments,
  addComment,
  editComment,
  deleteComment
};
