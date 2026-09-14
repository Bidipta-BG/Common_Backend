-- Referral System Schema for GetTambola
-- Run this in your Supabase SQL Editor

-- 1. Referrers Table
CREATE TABLE IF NOT EXISTS public.referrers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mobile TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  referral_points_total INTEGER DEFAULT 0,
  free_months_earned INTEGER DEFAULT 0,
  free_months_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Referrals Table (log of referred tenants)
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES public.referrers(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  plan TEXT NOT NULL,
  order_id TEXT,
  amount_paid NUMERIC DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- 'pending', 'successful', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_referrers_code ON public.referrers(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrers_email ON public.referrers(email);
CREATE INDEX IF NOT EXISTS idx_referrals_tenant ON public.referrals(tenant_id);

-- PostgREST Schema Cache Reload
NOTIFY pgrst, 'reload schema';
