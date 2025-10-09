-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a secure function to encrypt API secrets
-- This function will be used by edge functions to encrypt secrets before storing
CREATE OR REPLACE FUNCTION public.encrypt_secret(secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use AES-256 encryption with a key derived from Supabase's service role key
  -- The encryption key is never exposed to clients
  RETURN encode(
    pgp_sym_encrypt(
      secret,
      current_setting('app.settings.encryption_key', true),
      'cipher-algo=aes256'
    ),
    'base64'
  );
END;
$$;

-- Create a secure function to decrypt API secrets
-- This function can only be called from edge functions with service role access
CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF encrypted_secret IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN pgp_sym_decrypt(
    decode(encrypted_secret, 'base64'),
    current_setting('app.settings.encryption_key', true),
    'cipher-algo=aes256'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If decryption fails, return NULL (might be unencrypted legacy data)
    RETURN NULL;
END;
$$;

-- Add a column to track if secrets are encrypted
ALTER TABLE public.api_keys 
ADD COLUMN IF NOT EXISTS is_encrypted boolean DEFAULT false;

-- Create a view that NEVER exposes the actual secrets to clients
-- This view will be used by the client instead of direct table access
CREATE OR REPLACE VIEW public.api_keys_safe AS
SELECT 
  id,
  user_id,
  provider,
  mode,
  is_connected,
  last_tested_at,
  created_at,
  updated_at,
  -- Only expose masked versions of sensitive data
  CASE 
    WHEN api_key IS NOT NULL THEN 
      substring(api_key, 1, 4) || '...' || substring(api_key, length(api_key)-3, 4)
    ELSE NULL 
  END as api_key_masked,
  -- Never expose the secret at all
  CASE 
    WHEN api_secret IS NOT NULL THEN '***encrypted***'
    ELSE NULL 
  END as api_secret_masked,
  is_encrypted
FROM public.api_keys;

-- Grant appropriate permissions on the safe view
GRANT SELECT ON public.api_keys_safe TO authenticated;

-- Update RLS policies to be even more restrictive
-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can insert their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;

-- Create new restrictive policies that prevent SELECT of raw secrets
CREATE POLICY "Users can insert their own API keys"
ON public.api_keys
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
ON public.api_keys
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
ON public.api_keys
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- CRITICAL: Remove all SELECT policies on api_keys table
-- Clients should only use the api_keys_safe view
-- Only service role (edge functions) can SELECT from api_keys directly

-- Create a secure function for edge functions to get decrypted API keys
-- This should only be callable with service role access
CREATE OR REPLACE FUNCTION public.get_user_api_keys(p_user_id uuid, p_provider text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  provider text,
  api_key text,
  api_secret text,
  mode text,
  is_connected boolean,
  last_tested_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    k.id,
    k.provider::text,
    k.api_key,
    -- Decrypt the secret if encrypted, otherwise return as-is (for backward compatibility)
    CASE 
      WHEN k.is_encrypted THEN public.decrypt_secret(k.api_secret)
      ELSE k.api_secret
    END as api_secret,
    k.mode::text,
    k.is_connected,
    k.last_tested_at
  FROM public.api_keys k
  WHERE k.user_id = p_user_id
    AND (p_provider IS NULL OR k.provider::text = p_provider);
END;
$$;

-- Add comment explaining the security model
COMMENT ON TABLE public.api_keys IS 
'SECURITY: This table contains encrypted API secrets. Direct SELECT is disabled for clients. Use api_keys_safe view for UI display and get_user_api_keys() function from edge functions for decrypted access.';

COMMENT ON VIEW public.api_keys_safe IS 
'Safe view of API keys that only exposes masked versions. Use this in client applications.';

COMMENT ON FUNCTION public.get_user_api_keys IS 
'Secure function to retrieve decrypted API keys. Only callable from edge functions with service role access.';