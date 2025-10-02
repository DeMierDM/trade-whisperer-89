-- Remove polygon API keys first, then change enum
-- Step 1: Delete any existing polygon API keys
DELETE FROM public.api_keys WHERE provider = 'polygon';

-- Step 2: Create new enum without polygon
CREATE TYPE public.api_provider_new AS ENUM ('alpaca', 'openai');

-- Step 3: Alter the column to use the new enum
ALTER TABLE public.api_keys 
  ALTER COLUMN provider TYPE public.api_provider_new 
  USING provider::text::public.api_provider_new;

-- Step 4: Drop the old enum
DROP TYPE public.api_provider;

-- Step 5: Rename the new enum to the original name
ALTER TYPE public.api_provider_new RENAME TO api_provider;