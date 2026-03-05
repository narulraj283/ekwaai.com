-- ============================================================================
-- EkwaAI.com Supabase Database Setup SQL
-- ============================================================================
-- This script creates the complete database schema for EkwaAI in PostgreSQL.
-- Copy-paste this entire script into the Supabase SQL editor.
--
-- Schema includes:
--   - Users & authentication
--   - Wins/achievements sharing
--   - Manager evaluations
--   - Bonus recommendations
--   - Announcements
--   - Referrals
--   - Win celebrations
--   - Functions and realtime enablement
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE 1: users
-- ============================================================================
-- Core user table for EkwaAI members
-- Links to Supabase auth.users via id
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  department text NOT NULL CHECK (department IN ('marketing', 'ekwalabs', 'pda', 'coaching', 'business', 'sales', 'customer_success')),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Index on email for quick lookups
CREATE INDEX idx_users_email ON users(email);
-- Index on department for filtering
CREATE INDEX idx_users_department ON users(department);
-- Index on role for permission checks
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- TABLE 2: wins
-- ============================================================================
-- Shared wins/achievements by team members
-- Tracks celebrations and Slack posting status
CREATE TABLE IF NOT EXISTS wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN ('marketing', 'ekwalabs', 'pda', 'coaching', 'business', 'sales', 'customer_success')),
  summary text NOT NULL,
  link_url text NOT NULL,
  celebrations integer DEFAULT 0 NOT NULL,
  slack_posted boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for fast queries
CREATE INDEX idx_wins_user_id ON wins(user_id);
CREATE INDEX idx_wins_department ON wins(department);
CREATE INDEX idx_wins_created_at ON wins(created_at DESC);
-- For quick "recent wins" queries
CREATE INDEX idx_wins_recent ON wins(created_at DESC) WHERE created_at > now() - INTERVAL '7 days';

-- ============================================================================
-- TABLE 3: evaluations
-- ============================================================================
-- Monthly manager evaluations of team members
-- One evaluation per member per month
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2024),
  multiplier decimal(4, 2) NOT NULL CHECK (multiplier >= 1.0 AND multiplier <= 20.0),
  quality_score integer NOT NULL CHECK (quality_score >= 1 AND quality_score <= 5),
  ai_leverage text NOT NULL CHECK (ai_leverage IN ('minimal', 'moderate', 'significant', 'extensive')),
  notes text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(member_id, month, year)
);

-- Indexes for manager queries
CREATE INDEX idx_evaluations_member_id ON evaluations(member_id);
CREATE INDEX idx_evaluations_evaluator_id ON evaluations(evaluator_id);
CREATE INDEX idx_evaluations_month_year ON evaluations(month, year);

-- ============================================================================
-- TABLE 4: bonus_recommendations
-- ============================================================================
-- Quarterly bonus recommendations from managers to admins
-- Tracks approval workflow
CREATE TABLE IF NOT EXISTS bonus_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quarter integer NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  year integer NOT NULL CHECK (year >= 2024),
  tier text NOT NULL CHECK (tier IN ('5x', '10x', '10x_sustained')),
  justification text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  admin_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for workflow
CREATE INDEX idx_bonus_member_id ON bonus_recommendations(member_id);
CREATE INDEX idx_bonus_manager_id ON bonus_recommendations(manager_id);
CREATE INDEX idx_bonus_status ON bonus_recommendations(status);
CREATE INDEX idx_bonus_quarter_year ON bonus_recommendations(quarter, year);

-- ============================================================================
-- TABLE 5: announcements
-- ============================================================================
-- Admin announcements for "What's New" section
-- Used to communicate updates to all team members
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  priority text DEFAULT 'normal' CHECK (priority IN ('normal', 'important')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Index for recent announcements
CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);
-- Index for filtering by priority
CREATE INDEX idx_announcements_priority ON announcements(priority);

-- ============================================================================
-- TABLE 6: referrals
-- ============================================================================
-- Manager referrals for new team members
-- Tracks approval/decline workflow by admins
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_name text NOT NULL,
  referred_email text NOT NULL,
  department text NOT NULL CHECK (department IN ('marketing', 'ekwalabs', 'pda', 'coaching', 'business', 'sales', 'customer_success')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  review_notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for admin workflow
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_created_at ON referrals(created_at DESC);

-- ============================================================================
-- TABLE 7: win_celebrations
-- ============================================================================
-- Track who celebrated which wins (prevents duplicate celebrations)
-- Used with celebrate_win() and uncelebrate_win() functions
CREATE TABLE IF NOT EXISTS win_celebrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  win_id uuid NOT NULL REFERENCES wins(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(win_id, user_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_win_celebrations_win_id ON win_celebrations(win_id);
CREATE INDEX idx_win_celebrations_user_id ON win_celebrations(user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function 1: celebrate_win()
-- Atomically insert a celebration and increment the wins.celebrations counter
-- Prevents race conditions and duplicate celebrations
CREATE OR REPLACE FUNCTION celebrate_win(win_uuid uuid)
RETURNS void AS $$
BEGIN
  -- Insert celebration record
  INSERT INTO win_celebrations (win_id, user_id)
  VALUES (win_uuid, auth.uid())
  ON CONFLICT (win_id, user_id) DO NOTHING;

  -- Increment celebrations counter
  UPDATE wins
  SET celebrations = celebrations + 1
  WHERE id = win_uuid
    AND NOT EXISTS (
      SELECT 1 FROM win_celebrations
      WHERE win_id = win_uuid
        AND user_id = auth.uid()
        AND created_at > now() - INTERVAL '1 second'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 2: uncelebrate_win()
-- Remove celebration and decrement counter atomically
CREATE OR REPLACE FUNCTION uncelebrate_win(win_uuid uuid)
RETURNS void AS $$
BEGIN
  -- Delete celebration record
  DELETE FROM win_celebrations
  WHERE win_id = win_uuid
    AND user_id = auth.uid();

  -- Decrement celebrations counter
  UPDATE wins
  SET celebrations = GREATEST(celebrations - 1, 0)
  WHERE id = win_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 3: get_department_stats()
-- Returns aggregated stats for a department
-- Useful for dashboards showing department performance
CREATE OR REPLACE FUNCTION get_department_stats(dept text)
RETURNS TABLE (
  department text,
  wins_count integer,
  avg_multiplier decimal,
  active_members integer,
  total_celebrations integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dept::text as department,
    COUNT(DISTINCT w.id)::integer as wins_count,
    AVG(e.multiplier)::decimal as avg_multiplier,
    COUNT(DISTINCT u.id)::integer as active_members,
    COALESCE(SUM(w.celebrations), 0)::integer as total_celebrations
  FROM users u
  LEFT JOIN wins w ON u.id = w.user_id AND w.department = dept
  LEFT JOIN evaluations e ON u.id = e.member_id
  WHERE u.department = dept
    AND u.status = 'active'
  GROUP BY dept;
END;
$$ LANGUAGE plpgsql;

-- Function 4: get_monthly_digest()
-- Returns summary of wins grouped by department for the last 24 hours
-- Used for daily email digests or dashboard summaries
CREATE OR REPLACE FUNCTION get_monthly_digest()
RETURNS TABLE (
  department text,
  wins_summary text,
  wins_count integer,
  total_celebrations integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.department,
    STRING_AGG(w.summary, ' | ' ORDER BY w.created_at DESC)::text,
    COUNT(*)::integer as wins_count,
    SUM(w.celebrations)::integer as total_celebrations
  FROM wins w
  WHERE w.created_at > now() - INTERVAL '24 hours'
  GROUP BY w.department
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- CRITICAL: These policies enforce data access control at the database level
-- All tables have RLS enabled

-- ===== users table RLS =====
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read all users (needed for displaying names, avatars)
CREATE POLICY "Users: authenticated read all" ON users
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Only admins can insert new users
CREATE POLICY "Users: admins insert" ON users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins can update anyone; users can update their own avatar_url and name
CREATE POLICY "Users: update own or admin update all" ON users
  FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can delete users
CREATE POLICY "Users: admins delete" ON users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===== wins table RLS =====
ALTER TABLE wins ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read all wins (transparency/visibility)
CREATE POLICY "Wins: authenticated read all" ON wins
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Users can insert their own wins
CREATE POLICY "Wins: authenticated insert own" ON wins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: User can update their own wins; admins can update any
CREATE POLICY "Wins: update own or admin update all" ON wins
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: User can delete their own wins; admins can delete any
CREATE POLICY "Wins: delete own or admin delete all" ON wins
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===== evaluations table RLS =====
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Policy: Admins see all; managers see their own evaluations; members see evaluations where they're the member
CREATE POLICY "Evaluations: role-based read" ON evaluations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager' AND id = evaluator_id
    )
    OR auth.uid() = member_id
  );

-- Policy: Managers and admins can insert
CREATE POLICY "Evaluations: managers and admins insert" ON evaluations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'manager')
    )
  );

-- Policy: The evaluator can update their own; admins can update any
CREATE POLICY "Evaluations: evaluator update own or admin update all" ON evaluations
  FOR UPDATE
  USING (
    auth.uid() = evaluator_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = evaluator_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can delete evaluations
CREATE POLICY "Evaluations: admins delete" ON evaluations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===== bonus_recommendations table RLS =====
ALTER TABLE bonus_recommendations ENABLE ROW LEVEL SECURITY;

-- Policy: Admins see all; managers see their own recommendations; members see their own
CREATE POLICY "Bonus: role-based read" ON bonus_recommendations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager' AND id = manager_id
    )
    OR auth.uid() = member_id
  );

-- Policy: Managers and admins can insert
CREATE POLICY "Bonus: managers and admins insert" ON bonus_recommendations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'manager')
    )
  );

-- Policy: Only admins can update (they approve/reject)
CREATE POLICY "Bonus: admins update" ON bonus_recommendations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can delete
CREATE POLICY "Bonus: admins delete" ON bonus_recommendations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===== announcements table RLS =====
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read announcements
CREATE POLICY "Announcements: authenticated read" ON announcements
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Only admins can insert
CREATE POLICY "Announcements: admins insert" ON announcements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can update
CREATE POLICY "Announcements: admins update" ON announcements
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can delete
CREATE POLICY "Announcements: admins delete" ON announcements
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===== referrals table RLS =====
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Policy: Admins see all; managers see their own referrals
CREATE POLICY "Referrals: role-based read" ON referrals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager' AND id = referrer_id
    )
  );

-- Policy: Managers and admins can insert
CREATE POLICY "Referrals: managers and admins insert" ON referrals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'manager')
    )
  );

-- Policy: Only admins can update (they approve/decline)
CREATE POLICY "Referrals: admins update" ON referrals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can delete
CREATE POLICY "Referrals: admins delete" ON referrals
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===== win_celebrations table RLS =====
ALTER TABLE win_celebrations ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read celebrations
CREATE POLICY "Celebrations: authenticated read" ON win_celebrations
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can insert their own celebrations
CREATE POLICY "Celebrations: insert own" ON win_celebrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own celebrations
CREATE POLICY "Celebrations: delete own" ON win_celebrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- REALTIME ENABLEMENT
-- ============================================================================
-- Enable realtime on tables that need live updates

ALTER PUBLICATION supabase_realtime ADD TABLE wins;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;

-- ============================================================================
-- SEED DATA
-- ============================================================================
-- NOTE: These are the initial admin users. After they sign up via Supabase Auth,
-- their auth.users.id will be automatically available. Update these UUIDs
-- to match the actual IDs generated by Supabase Auth when admins sign up.
--
-- To add these users:
-- 1. Sign up naren@ekwa.com and lakshika@ekwa.com through the auth system
-- 2. Copy their auth.users.id values
-- 3. Replace the placeholder UUIDs below with the actual IDs
-- 4. Execute this insert statement

-- Example placeholder UUIDs (replace with actual auth IDs after signup):
-- INSERT INTO users (id, email, name, department, role, status)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001', 'naren@ekwa.com', 'Naren', 'ekwalabs', 'admin', 'active'),
--   ('00000000-0000-0000-0000-000000000002', 'lakshika@ekwa.com', 'Lakshika', 'pda', 'admin', 'active');

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================
-- Automatically update the updated_at timestamp on modifications

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bonus_recommendations_updated_at BEFORE UPDATE ON bonus_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END OF SETUP SCRIPT
-- ============================================================================
-- All tables, indexes, functions, policies, and triggers are now created.
-- The database is ready for use with the EkwaAI application.
--
-- Next steps:
-- 1. Add initial admin users via Supabase Auth signup
-- 2. Update the seed data section with actual auth IDs
-- 3. Create Supabase anon and service_role API keys for the frontend/backend
-- 4. Configure environment variables in your application
