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

-- ============================================================================
-- OPTIONS BACKTESTING SCHEMA
-- ============================================================================

-- Backtests table - stores metadata and results for each backtest run
CREATE TABLE IF NOT EXISTS backtests (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    strategy_name VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    initial_capital DECIMAL(15, 2) NOT NULL,
    final_capital DECIMAL(15, 2),
    total_return DECIMAL(10, 4),
    sharpe_ratio DECIMAL(10, 4),
    sortino_ratio DECIMAL(10, 4),
    max_drawdown DECIMAL(10, 4),
    max_drawdown_duration_minutes INTEGER,
    win_rate DECIMAL(10, 4),
    profit_factor DECIMAL(10, 4),
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    avg_win DECIMAL(15, 4),
    avg_loss DECIMAL(15, 4),
    largest_win DECIMAL(15, 4),
    largest_loss DECIMAL(15, 4),
    avg_holding_period_minutes INTEGER,
    execution_mode VARCHAR(10) NOT NULL DEFAULT 'backtest', -- 'backtest' or 'live'
    status VARCHAR(20) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    error_message TEXT,
    parameters JSONB, -- Strategy-specific parameters
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Individual option contracts - tracks each position from entry to exit
CREATE TABLE IF NOT EXISTS option_contracts (
    id SERIAL PRIMARY KEY,
    instance_id UUID UNIQUE NOT NULL, -- Unique identifier per position instance
    backtest_id INTEGER REFERENCES backtests(id) ON DELETE CASCADE,
    contract_symbol VARCHAR(50) NOT NULL, -- e.g., SPY251031C00450000
    underlying_symbol VARCHAR(20) NOT NULL,
    strike_price DECIMAL(10, 2) NOT NULL,
    expiry_date DATE NOT NULL,
    option_type VARCHAR(4) NOT NULL, -- CALL or PUT
    
    -- Entry details
    entry_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    entry_price DECIMAL(10, 4) NOT NULL,
    entry_bid DECIMAL(10, 4), -- NULL for backtesting mode
    entry_ask DECIMAL(10, 4), -- NULL for backtesting mode
    entry_spread_pct DECIMAL(8, 6), -- NULL for backtesting mode
    quantity INTEGER NOT NULL,
    entry_underlying_price DECIMAL(10, 4),
    
    -- Greeks at entry
    entry_delta DECIMAL(8, 6),
    entry_gamma DECIMAL(8, 6),
    entry_theta DECIMAL(8, 6),
    entry_vega DECIMAL(8, 6),
    entry_rho DECIMAL(8, 6),
    entry_iv DECIMAL(8, 6), -- Implied Volatility
    
    -- Exit details
    exit_timestamp TIMESTAMP WITH TIME ZONE,
    exit_price DECIMAL(10, 4),
    exit_bid DECIMAL(10, 4), -- NULL for backtesting mode
    exit_ask DECIMAL(10, 4), -- NULL for backtesting mode
    exit_underlying_price DECIMAL(10, 4),
    
    -- Greeks at exit
    exit_delta DECIMAL(8, 6),
    exit_gamma DECIMAL(8, 6),
    exit_theta DECIMAL(8, 6),
    exit_vega DECIMAL(8, 6),
    exit_rho DECIMAL(8, 6),
    exit_iv DECIMAL(8, 6),
    
    -- P&L tracking (per contract, multiplier of 100 applied)
    gross_pnl DECIMAL(15, 4),
    net_pnl DECIMAL(15, 4),
    fees DECIMAL(10, 4) DEFAULT 0,
    slippage DECIMAL(10, 4) DEFAULT 0,
    return_pct DECIMAL(10, 4), -- (exit_price - entry_price) / entry_price * 100
    
    -- Risk metrics
    max_adverse_excursion DECIMAL(10, 4), -- MAE - worst price during hold
    max_favorable_excursion DECIMAL(10, 4), -- MFE - best price during hold
    holding_period_minutes INTEGER,
    
    -- Status and close reason
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED, EXPIRED
    close_reason VARCHAR(50), -- STRATEGY_EXIT, PROFIT_TARGET, STOP_LOSS, TIME_STOP, EXPIRY
    
    -- Mode tracking
    execution_mode VARCHAR(10) NOT NULL DEFAULT 'backtest',
    
    -- Signal data that triggered this position
    signal_data JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Strategy signals - tracks all signals generated (executed or not)
CREATE TABLE IF NOT EXISTS strategy_signals (
    id SERIAL PRIMARY KEY,
    backtest_id INTEGER REFERENCES backtests(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    signal_type VARCHAR(20) NOT NULL, -- BUY_CALL, BUY_PUT, SELL, HOLD
    symbol VARCHAR(20) NOT NULL,
    underlying_price DECIMAL(10, 4),
    
    -- Indicator values at signal time
    indicator_values JSONB, -- Store VWAP, slope, RSI, etc.
    
    -- Contract selection criteria used
    target_delta DECIMAL(8, 6),
    target_strike DECIMAL(10, 2),
    target_expiry DATE,
    
    -- Execution tracking
    executed BOOLEAN DEFAULT FALSE,
    contract_id INTEGER REFERENCES option_contracts(id),
    rejection_reason VARCHAR(255), -- Why signal wasn't executed
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Greeks time series - tracks Greeks evolution during position lifetime
CREATE TABLE IF NOT EXISTS contract_greeks_history (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES option_contracts(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    underlying_price DECIMAL(10, 4),
    option_price DECIMAL(10, 4),
    delta DECIMAL(8, 6),
    gamma DECIMAL(8, 6),
    theta DECIMAL(8, 6),
    vega DECIMAL(8, 6),
    rho DECIMAL(8, 6),
    implied_volatility DECIMAL(8, 6),
    time_to_expiry_days DECIMAL(10, 6),
    unrealized_pnl DECIMAL(15, 4), -- P&L at this point in time
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bar-level OHLCV + Greeks tracking per contract instance
-- Stores complete bar data and Greeks for every minute while position is open
CREATE TABLE IF NOT EXISTS option_contract_bars (
    id SERIAL PRIMARY KEY,
    contract_instance_id UUID NOT NULL, -- References option_contracts.instance_id
    bar_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Option OHLCV data
    option_open DECIMAL(10, 4),
    option_high DECIMAL(10, 4),
    option_low DECIMAL(10, 4),
    option_close DECIMAL(10, 4),
    option_volume INTEGER,
    
    -- Underlying price at this bar
    underlying_price DECIMAL(10, 4),
    
    -- Greeks calculated for this bar
    delta DECIMAL(8, 6),
    gamma DECIMAL(8, 6),
    theta DECIMAL(8, 6),
    vega DECIMAL(8, 6),
    rho DECIMAL(8, 6),
    implied_volatility DECIMAL(8, 6),
    time_to_expiry DECIMAL(10, 8), -- In years (for 0DTE, decreases toward 0)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate bars
    CONSTRAINT unique_contract_bar UNIQUE (contract_instance_id, bar_timestamp)
);

-- Performance indexes for backtesting queries
CREATE INDEX IF NOT EXISTS idx_backtests_user_symbol ON backtests(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_backtests_dates ON backtests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_backtests_strategy ON backtests(strategy_name);
CREATE INDEX IF NOT EXISTS idx_backtests_status ON backtests(status);

CREATE INDEX IF NOT EXISTS idx_contracts_backtest ON option_contracts(backtest_id);
CREATE INDEX IF NOT EXISTS idx_contracts_instance ON option_contracts(instance_id);
CREATE INDEX IF NOT EXISTS idx_contracts_symbol ON option_contracts(contract_symbol);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON option_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_entry_time ON option_contracts(entry_timestamp);
CREATE INDEX IF NOT EXISTS idx_contracts_expiry ON option_contracts(expiry_date);

CREATE INDEX IF NOT EXISTS idx_signals_backtest ON strategy_signals(backtest_id);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON strategy_signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_executed ON strategy_signals(executed);

CREATE INDEX IF NOT EXISTS idx_greeks_contract ON contract_greeks_history(contract_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_greeks_timestamp ON contract_greeks_history(timestamp);

CREATE INDEX IF NOT EXISTS idx_contract_bars_instance ON option_contract_bars(contract_instance_id);
CREATE INDEX IF NOT EXISTS idx_contract_bars_timestamp ON option_contract_bars(bar_timestamp);
CREATE INDEX IF NOT EXISTS idx_contract_bars_instance_time ON option_contract_bars(contract_instance_id, bar_timestamp);

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