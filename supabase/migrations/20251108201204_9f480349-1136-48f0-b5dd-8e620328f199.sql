-- Fix Critical Security Issue #1: Add missing RLS policies for ai_usage_tracking
-- This allows the quota system to function properly

CREATE POLICY "Users can insert their own usage"
ON ai_usage_tracking
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage"
ON ai_usage_tracking
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix Critical Security Issue #2: Remove guest data access to prevent privacy violation
-- First, delete any existing guest data (where user_id IS NULL)
DELETE FROM pose_analyses WHERE user_id IS NULL;

-- Drop the guest insert policy
DROP POLICY IF EXISTS "Guest users can insert analyses" ON pose_analyses;

-- Update SELECT policy to remove guest access
DROP POLICY IF EXISTS "Users can view their own analyses" ON pose_analyses;
CREATE POLICY "Users can view their own analyses"
ON pose_analyses
FOR SELECT
USING (auth.uid() = user_id);

-- Update DELETE policy to remove guest access
DROP POLICY IF EXISTS "Users can delete their own analyses" ON pose_analyses;
CREATE POLICY "Users can delete their own analyses"
ON pose_analyses
FOR DELETE
USING (auth.uid() = user_id);

-- Make user_id required to enforce authentication
ALTER TABLE pose_analyses ALTER COLUMN user_id SET NOT NULL;