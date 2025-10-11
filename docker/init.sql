-- Initialize the local trading database
-- This replaces all Supabase functionality

-- Create users table (simplified auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create API keys table (no encryption complexity)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    mode VARCHAR(10) NOT NULL DEFAULT 'paper',
    is_connected BOOLEAN DEFAULT false,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Create trading sessions table
CREATE TABLE IF NOT EXISTS trading_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create default user for testing
INSERT INTO users (email) VALUES ('trader@local.dev') 
ON CONFLICT (email) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_provider ON api_keys(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_user ON trading_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_expires ON trading_sessions(expires_at);

-- Insert sample API keys (you can update these later)
DO $$
DECLARE
    default_user_id UUID;
BEGIN
    SELECT id INTO default_user_id FROM users WHERE email = 'trader@local.dev';
    
    INSERT INTO api_keys (user_id, provider, api_key, api_secret, mode, is_connected)
    VALUES (default_user_id, 'alpaca', 'SAMPLE_KEY', 'SAMPLE_SECRET', 'paper', false)
    ON CONFLICT (user_id, provider) DO NOTHING;
END $$;