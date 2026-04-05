
-- Fix 1: Remove client UPDATE and INSERT policies on ai_usage_tracking
-- Usage tracking should only be managed server-side
DROP POLICY "Users can update their own usage" ON ai_usage_tracking;
DROP POLICY "Users can insert their own usage" ON ai_usage_tracking;

-- Fix 2: Remove redundant email column from profiles
ALTER TABLE profiles DROP COLUMN email;

-- Fix 3: Update handle_new_user trigger to stop copying email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$function$;
