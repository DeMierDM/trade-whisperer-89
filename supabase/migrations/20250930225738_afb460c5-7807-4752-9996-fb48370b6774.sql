-- Create enum for API providers
CREATE TYPE api_provider AS ENUM ('polygon', 'alpaca', 'openai');

-- Create enum for trading mode
CREATE TYPE trading_mode AS ENUM ('paper', 'live');

-- Table for API keys (encrypted at rest by Supabase)
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider api_provider NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT, -- Only for Alpaca
  mode trading_mode, -- Only for Alpaca
  is_connected BOOLEAN DEFAULT false,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Table for risk controls
CREATE TABLE public.risk_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  max_positions INTEGER DEFAULT 10,
  max_position_size_usd INTEGER DEFAULT 5000,
  max_spread_cents INTEGER DEFAULT 12,
  min_open_interest INTEGER DEFAULT 100,
  daily_loss_limit_usd INTEGER DEFAULT 5000,
  weekly_loss_limit_usd INTEGER DEFAULT 15000,
  monthly_loss_limit_usd INTEGER DEFAULT 50000,
  max_drawdown_pct DECIMAL DEFAULT 15,
  trading_start_time TIME DEFAULT '09:30:00',
  trading_end_time TIME DEFAULT '15:45:00',
  max_hold_time_minutes INTEGER DEFAULT 180,
  pre_expiry_close_minutes INTEGER DEFAULT 15,
  auto_kill_data_loss_seconds INTEGER DEFAULT 30,
  auto_kill_pnl_spike_pct DECIMAL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table for strategy defaults
CREATE TABLE public.strategy_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ema_length INTEGER DEFAULT 21,
  entry_deviation_pct DECIMAL DEFAULT 0.18,
  near_deviation_pct DECIMAL DEFAULT 0.06,
  min_slope DECIMAL DEFAULT 0.00032,
  rv_cap_bps INTEGER DEFAULT 50,
  time_stop_bars INTEGER DEFAULT 120,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_defaults ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_keys
CREATE POLICY "Users can view their own API keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for risk_controls
CREATE POLICY "Users can view their own risk controls"
  ON public.risk_controls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk controls"
  ON public.risk_controls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk controls"
  ON public.risk_controls FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for strategy_defaults
CREATE POLICY "Users can view their own strategy defaults"
  ON public.strategy_defaults FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategy defaults"
  ON public.strategy_defaults FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy defaults"
  ON public.strategy_defaults FOR UPDATE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_controls_updated_at
  BEFORE UPDATE ON public.risk_controls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategy_defaults_updated_at
  BEFORE UPDATE ON public.strategy_defaults
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();