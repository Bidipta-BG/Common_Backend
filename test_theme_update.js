require('dotenv').config();
const { supabaseAdmin } = require('./src/apps/starttambola/config/supabaseClient');
const { updateTenantThemeByDomain } = require('./src/apps/starttambola/services/themes.service');

async function testService() {
  console.log('--- Testing Theme Update by Domain Service ---');

  // 1. Fetch a valid theme to apply
  const { data: themes, error: themeErr } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('is_active', true)
    .limit(1);

  if (themeErr || !themes || themes.length === 0) {
    console.error('Failed to fetch a theme or no active themes exist in DB.');
    if (themeErr) console.error(themeErr);
    return;
  }
  const theme = themes[0];
  console.log(`Found active theme to test with: ${theme.name} (${theme.id})`);

  // 2. Fetch a valid tenant to simulate the update on
  const { data: tenants, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name, domain')
    .limit(1);

  if (tenantErr || !tenants || tenants.length === 0) {
    console.error('Failed to fetch a tenant or no tenants exist in DB.');
    if (tenantErr) console.error(tenantErr);
    return;
  }
  const tenant = tenants[0];
  console.log(`Found tenant to test with: ${tenant.business_name} (${tenant.domain}, ID: ${tenant.id})`);

  try {
    console.log(`\nAttempting to update theme for domain '${tenant.domain}'...`);
    // authTenantId should match the tenant's ID to pass the security check
    const result = await updateTenantThemeByDomain(tenant.id, {
      domain: tenant.domain,
      themeId: theme.id,
      themeOverrides: { test_override: 'working' }
    });
    
    console.log('\n✅ Service test successful!');
    console.log('Updated Tenant Data:', result.tenant);
    console.log('Applied Theme Data:', result.theme);
  } catch (error) {
    console.error('\n❌ Service test failed!');
    console.error(error);
  }
}

testService().then(() => process.exit(0));
