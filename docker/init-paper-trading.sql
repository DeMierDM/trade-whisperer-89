-- Paper Trading Database Schema
-- Separate from backtest data to avoid confusion

-- Paper Trading Bot Configuration
CREATE TABLE IF NOT EXISTS paper_bots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    strategy_name VARCHAR(255) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'stopped', -- 'running', 'paused', 'stopped', 'error'
    initial_capital DECIMAL(15,2) DEFAULT 10000.00,
    current_capital DECIMAL(15,2) DEFAULT 10000.00,
    max_positions INTEGER DEFAULT 5,
    commission_per_contract DECIMAL(6,2) DEFAULT 0.65,
    slippage_pct DECIMAL(6,4) DEFAULT 0.01,
    parameters JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,
    last_heartbeat TIMESTAMP,
    error_message TEXT
);

-- Paper Trading Positions (Live)
CREATE TABLE IF NOT EXISTS paper_positions (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES paper_bots(id) ON DELETE CASCADE,
    contract_symbol VARCHAR(255) NOT NULL,
    underlying_symbol VARCHAR(20) NOT NULL,
    option_type VARCHAR(10) NOT NULL, -- 'call' or 'put'
    strike_price DECIMAL(10,2) NOT NULL,
    expiry_date DATE NOT NULL,
    
    -- Position Details
    quantity INTEGER NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    current_price DECIMAL(10,4),
    entry_time TIMESTAMP NOT NULL,
    
    -- Entry Signal Information
    entry_signal_type VARCHAR(50) NOT NULL, -- 'BUY_CALL', 'BUY_PUT'
    signal_strength DECIMAL(5,2),
    signal_reason TEXT,
    underlying_price_at_entry DECIMAL(10,2),
    
    -- Greeks at Entry
    entry_delta DECIMAL(6,4),
    entry_gamma DECIMAL(8,6),
    entry_theta DECIMAL(8,6),
    entry_vega DECIMAL(8,6),
    entry_iv DECIMAL(6,4),
    
    -- Current Greeks (Updated in Real-time)
    current_delta DECIMAL(6,4),
    current_gamma DECIMAL(8,6),
    current_theta DECIMAL(8,6),
    current_vega DECIMAL(8,6),
    current_iv DECIMAL(6,4),
    
    -- Exit Goals (For UI Display)
    profit_target_price DECIMAL(10,4),
    stop_loss_price DECIMAL(10,4),
    max_hold_until TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'closed', 'expired'
    unrealized_pnl DECIMAL(12,2) DEFAULT 0.00,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Paper Trading Trades (Completed)
CREATE TABLE IF NOT EXISTS paper_trades (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES paper_bots(id) ON DELETE CASCADE,
    position_id INTEGER REFERENCES paper_positions(id),
    
    -- Contract Information
    contract_symbol VARCHAR(255) NOT NULL,
    underlying_symbol VARCHAR(20) NOT NULL,
    option_type VARCHAR(10) NOT NULL,
    strike_price DECIMAL(10,2) NOT NULL,
    expiry_date DATE NOT NULL,
    
    -- Trade Details
    quantity INTEGER NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    exit_price DECIMAL(10,4) NOT NULL,
    entry_time TIMESTAMP NOT NULL,
    exit_time TIMESTAMP NOT NULL,
    
    -- Entry Signal
    entry_signal_type VARCHAR(50) NOT NULL,
    signal_strength DECIMAL(5,2),
    signal_reason TEXT,
    
    -- Exit Information
    exit_reason VARCHAR(100) NOT NULL, -- 'PROFIT_TARGET', 'STOP_LOSS', 'TIME_LIMIT', 'MANUAL', 'EXPIRY'
    
    -- P&L and Performance
    gross_pnl DECIMAL(12,2) NOT NULL,
    commission DECIMAL(8,2) NOT NULL,
    net_pnl DECIMAL(12,2) NOT NULL,
    return_pct DECIMAL(8,4) NOT NULL,
    
    -- Market Conditions
    underlying_price_entry DECIMAL(10,2),
    underlying_price_exit DECIMAL(10,2),
    
    -- Greeks at Entry/Exit
    entry_delta DECIMAL(6,4),
    exit_delta DECIMAL(6,4),
    entry_iv DECIMAL(6,4),
    exit_iv DECIMAL(6,4),
    
    -- Trade Duration
    duration_minutes INTEGER NOT NULL,
    dte_at_entry INTEGER NOT NULL, -- Days to expiry
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Paper Trading Portfolio History (For Equity Curve)
CREATE TABLE IF NOT EXISTS paper_portfolio_history (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES paper_bots(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    
    -- Portfolio Values
    total_value DECIMAL(15,2) NOT NULL, -- cash + positions market value
    cash_balance DECIMAL(15,2) NOT NULL,
    positions_value DECIMAL(15,2) NOT NULL,
    
    -- Performance Metrics
    total_return DECIMAL(8,4) NOT NULL,
    daily_pnl DECIMAL(12,2) NOT NULL,
    
    -- Risk Metrics
    open_positions_count INTEGER NOT NULL,
    max_position_exposure DECIMAL(12,2),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Paper Trading Signals (All generated signals, not just executed)
CREATE TABLE IF NOT EXISTS paper_signals (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES paper_bots(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    
    -- Signal Information
    signal_type VARCHAR(50) NOT NULL, -- 'BUY_CALL', 'BUY_PUT'
    underlying_symbol VARCHAR(20) NOT NULL,
    underlying_price DECIMAL(10,2) NOT NULL,
    signal_strength DECIMAL(5,2),
    signal_reason TEXT,
    
    -- Execution Status
    executed BOOLEAN DEFAULT FALSE,
    position_id INTEGER REFERENCES paper_positions(id),
    skip_reason TEXT, -- Why wasn't it executed? (no cash, max positions, etc.)
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Paper Trading Bot Metrics (Real-time performance)
CREATE TABLE IF NOT EXISTS paper_bot_metrics (
    bot_id INTEGER PRIMARY KEY REFERENCES paper_bots(id) ON DELETE CASCADE,
    
    -- Current Performance
    total_return DECIMAL(8,4) DEFAULT 0.0000,
    daily_pnl DECIMAL(12,2) DEFAULT 0.00,
    win_rate DECIMAL(6,4) DEFAULT 0.0000,
    profit_factor DECIMAL(8,4) DEFAULT 0.0000,
    sharpe_ratio DECIMAL(6,4) DEFAULT 0.0000,
    max_drawdown DECIMAL(6,4) DEFAULT 0.0000,
    
    -- Trading Statistics
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    average_win DECIMAL(10,2) DEFAULT 0.00,
    average_loss DECIMAL(10,2) DEFAULT 0.00,
    largest_win DECIMAL(10,2) DEFAULT 0.00,
    largest_loss DECIMAL(10,2) DEFAULT 0.00,
    
    -- Position Metrics
    open_positions INTEGER DEFAULT 0,
    avg_hold_time_minutes DECIMAL(8,2) DEFAULT 0.00,
    
    -- Signal Performance  
    signals_generated INTEGER DEFAULT 0,
    signals_executed INTEGER DEFAULT 0,
    signal_execution_rate DECIMAL(6,4) DEFAULT 0.0000,
    
    -- Last Update
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_paper_positions_bot_status ON paper_positions(bot_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_trades_bot_created ON paper_trades(bot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paper_portfolio_bot_time ON paper_portfolio_history(bot_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_paper_signals_bot_time ON paper_signals(bot_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_paper_positions_contract ON paper_positions(contract_symbol);

-- Functions for Real-time Updates

-- Function to update bot metrics whenever a trade completes
CREATE OR REPLACE FUNCTION update_paper_bot_metrics(bot_id_param INTEGER)
RETURNS VOID AS $$
DECLARE
    bot_metrics RECORD;
BEGIN
    -- Calculate current metrics
    WITH trade_stats AS (
        SELECT 
            COUNT(*) as total_trades,
            COUNT(CASE WHEN net_pnl > 0 THEN 1 END) as winning_trades,
            COUNT(CASE WHEN net_pnl < 0 THEN 1 END) as losing_trades,
            AVG(CASE WHEN net_pnl > 0 THEN net_pnl END) as avg_win,
            AVG(CASE WHEN net_pnl < 0 THEN net_pnl END) as avg_loss,
            MAX(net_pnl) as largest_win,
            MIN(net_pnl) as largest_loss,
            SUM(net_pnl) as total_pnl,
            AVG(duration_minutes) as avg_hold_minutes
        FROM paper_trades 
        WHERE bot_id = bot_id_param
    ),
    portfolio_stats AS (
        SELECT 
            current_capital,
            initial_capital
        FROM paper_bots 
        WHERE id = bot_id_param
    ),
    position_stats AS (
        SELECT 
            COUNT(*) as open_positions
        FROM paper_positions 
        WHERE bot_id = bot_id_param AND status = 'open'
    ),
    signal_stats AS (
        SELECT 
            COUNT(*) as signals_generated,
            COUNT(CASE WHEN executed = true THEN 1 END) as signals_executed
        FROM paper_signals
        WHERE bot_id = bot_id_param
    )
    SELECT 
        COALESCE(ts.total_trades, 0) as total_trades,
        COALESCE(ts.winning_trades, 0) as winning_trades,
        COALESCE(ts.losing_trades, 0) as losing_trades,
        COALESCE(ts.avg_win, 0) as average_win,
        COALESCE(ts.avg_loss, 0) as average_loss,
        COALESCE(ts.largest_win, 0) as largest_win,
        COALESCE(ts.largest_loss, 0) as largest_loss,
        COALESCE(ts.avg_hold_minutes, 0) as avg_hold_time_minutes,
        COALESCE(ps.open_positions, 0) as open_positions,
        COALESCE(ss.signals_generated, 0) as signals_generated,
        COALESCE(ss.signals_executed, 0) as signals_executed,
        -- Calculate metrics
        CASE 
            WHEN portfolio.initial_capital > 0 THEN 
                (portfolio.current_capital - portfolio.initial_capital) / portfolio.initial_capital
            ELSE 0 
        END as total_return,
        CASE 
            WHEN ts.total_trades > 0 THEN ts.winning_trades::DECIMAL / ts.total_trades 
            ELSE 0 
        END as win_rate,
        CASE 
            WHEN ts.avg_loss < 0 AND ts.avg_win > 0 THEN ts.avg_win / ABS(ts.avg_loss)
            ELSE 0 
        END as profit_factor,
        CASE 
            WHEN ss.signals_generated > 0 THEN ss.signals_executed::DECIMAL / ss.signals_generated
            ELSE 0 
        END as signal_execution_rate
    INTO bot_metrics
    FROM trade_stats ts
    CROSS JOIN portfolio_stats portfolio  
    CROSS JOIN position_stats ps
    CROSS JOIN signal_stats ss;

    -- Update metrics table
    INSERT INTO paper_bot_metrics (
        bot_id, total_return, win_rate, profit_factor, total_trades,
        winning_trades, losing_trades, average_win, average_loss,
        largest_win, largest_loss, open_positions, avg_hold_time_minutes,
        signals_generated, signals_executed, signal_execution_rate, updated_at
    ) VALUES (
        bot_id_param, bot_metrics.total_return, bot_metrics.win_rate,
        bot_metrics.profit_factor, bot_metrics.total_trades,
        bot_metrics.winning_trades, bot_metrics.losing_trades, 
        bot_metrics.average_win, bot_metrics.average_loss,
        bot_metrics.largest_win, bot_metrics.largest_loss,
        bot_metrics.open_positions, bot_metrics.avg_hold_time_minutes,
        bot_metrics.signals_generated, bot_metrics.signals_executed,
        bot_metrics.signal_execution_rate, NOW()
    )
    ON CONFLICT (bot_id) DO UPDATE SET
        total_return = EXCLUDED.total_return,
        win_rate = EXCLUDED.win_rate, 
        profit_factor = EXCLUDED.profit_factor,
        total_trades = EXCLUDED.total_trades,
        winning_trades = EXCLUDED.winning_trades,
        losing_trades = EXCLUDED.losing_trades,
        average_win = EXCLUDED.average_win,
        average_loss = EXCLUDED.average_loss,
        largest_win = EXCLUDED.largest_win,
        largest_loss = EXCLUDED.largest_loss,
        open_positions = EXCLUDED.open_positions,
        avg_hold_time_minutes = EXCLUDED.avg_hold_time_minutes,
        signals_generated = EXCLUDED.signals_generated,
        signals_executed = EXCLUDED.signals_executed,
        signal_execution_rate = EXCLUDED.signal_execution_rate,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update bot capital when trades complete
CREATE OR REPLACE FUNCTION update_bot_capital()
RETURNS TRIGGER AS $$
BEGIN
    -- Update current capital based on trade P&L
    UPDATE paper_bots 
    SET current_capital = current_capital + NEW.net_pnl
    WHERE id = NEW.bot_id;
    
    -- Update bot metrics
    PERFORM update_paper_bot_metrics(NEW.bot_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_bot_capital ON paper_trades;
CREATE TRIGGER trigger_update_bot_capital
    AFTER INSERT ON paper_trades
    FOR EACH ROW
    EXECUTE FUNCTION update_bot_capital();

-- Sample data for testing
INSERT INTO paper_bots (name, strategy_name, symbol, status, parameters) VALUES 
(
    'IWM Test Bot', 
    'iwm-optimized-strategy', 
    'IWM', 
    'stopped',
    '{"rsi_overbought": 60, "rsi_oversold": 40, "vwap_threshold": 0.002, "profit_target": 0.25, "stop_loss": 0.15}'
);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO trader;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO trader;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO trader;