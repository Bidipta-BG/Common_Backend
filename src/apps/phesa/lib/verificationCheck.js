const isBusinessVerified = async (userId, supabase) => {
  const { data, error } = await supabase
    .from('claimed_businesses')
    .select('verification_status')
    .eq('user_id', userId)
    .maybeSingle();
    
  if (error || !data) {
    return false;
  }
  
  return data.verification_status === 'verified';
};

module.exports = { isBusinessVerified };
