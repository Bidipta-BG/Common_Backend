-- AI Business Analyzer Supabase Schema
-- Run this in your Supabase SQL Editor

-- 1. Users Table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Audits Table
CREATE TABLE IF NOT EXISTS public.audits (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  website_url TEXT NOT NULL,
  business_name TEXT,
  business_city TEXT,
  overall_score INTEGER,
  status TEXT DEFAULT 'pending',
  report_json JSONB,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Free Audits (tracking anonymous free uses)
CREATE TABLE IF NOT EXISTS public.free_audits (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  ip_address TEXT,
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Scores Table
CREATE TABLE IF NOT EXISTS public.scores (
  id UUID PRIMARY KEY,
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  score INTEGER,
  findings_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Google Reputation Table
CREATE TABLE IF NOT EXISTS public.google_reputation (
  id UUID PRIMARY KEY,
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE,
  google_rating NUMERIC,
  google_review_count INTEGER,
  photos_count INTEGER,
  profile_completeness INTEGER,
  top_competitors_json JSONB,
  recent_reviews_json JSONB,
  reputation_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Competitors Table
CREATE TABLE IF NOT EXISTS public.competitors (
  id UUID PRIMARY KEY,
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE,
  competitor_url TEXT,
  competitor_name TEXT,
  their_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  razorpay_subscription_id TEXT,
  plan_id TEXT,
  status TEXT,
  current_start TIMESTAMPTZ,
  current_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security Rules (Optional but recommended)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- PostgREST Schema Cache Reload
-- This ensures the API immediately sees the newly created tables!
NOTIFY pgrst, 'reload schema';
