-- Multi-Bot Paper Trading Schema Extensions
-- Add columns to existing paper_bots table and create new tables for multi-bot management

-- Add new columns to paper_bots table for allocation and risk management
ALTER TABLE paper_bots 
ADD COLUMN IF NOT EXISTS allocation_percent DECIMAL(5,2) DEFAULT 33.33,
ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'moderate',
ADD COLUMN IF NOT EXISTS bot_group VARCHAR(50) DEFAULT 'default',
ADD COLUMN IF NOT EXISTS performance_target DECIMAL(10,4) DEFAULT 0.10,
ADD COLUMN IF NOT EXISTS max_daily_loss DECIMAL(10,2) DEFAULT 500.00;

-- Create bot performance tracking table
CREATE TABLE IF NOT EXISTS paper_bot_performance (
  performance_id SERIAL PRIMARY KEY,
  bot_id INTEGER REFERENCES paper_bots(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  
  -- Daily metrics
  starting_capital DECIMAL(15,2) NOT NULL,
  ending_capital DECIMAL(15,2) NOT NULL,
  daily_pnl DECIMAL(15,2) NOT NULL,
  daily_return_pct DECIMAL(10,4) NOT NULL,
  
  -- Trade metrics
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2) DEFAULT 0,
  avg_trade_return DECIMAL(10,4) DEFAULT 0,
  best_trade DECIMAL(15,2) DEFAULT 0,
  worst_trade DECIMAL(15,2) DEFAULT 0,
  
  -- Risk metrics
  max_drawdown DECIMAL(10,4) DEFAULT 0,
  sharpe_ratio DECIMAL(10,4) DEFAULT 0,
  max_position_size DECIMAL(15,2) DEFAULT 0,
  risk_score DECIMAL(5,2) DEFAULT 0,
  
  -- Operational metrics
  active_time_minutes INTEGER DEFAULT 0,
  signals_generated INTEGER DEFAULT 0,
  signals_executed INTEGER DEFAULT 0,
  execution_rate DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(bot_id, report_date)
);

-- Create end-of-day reports table
CREATE TABLE IF NOT EXISTS paper_bot_reports (
  report_id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type VARCHAR(50) NOT NULL, -- 'end_of_day', 'weekly', 'monthly'
  report_data JSONB NOT NULL,
  
  -- Summary metrics
  total_bots INTEGER DEFAULT 0,
  active_bots INTEGER DEFAULT 0,
  total_capital DECIMAL(15,2) DEFAULT 0,
  total_pnl DECIMAL(15,2) DEFAULT 0,
  best_bot_id INTEGER,
  worst_bot_id INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(report_date, report_type)
);

-- Create bot allocation history table
CREATE TABLE IF NOT EXISTS paper_bot_allocations (
  allocation_id SERIAL PRIMARY KEY,
  bot_id INTEGER REFERENCES paper_bots(id) ON DELETE CASCADE,
  
  -- Allocation details
  allocation_date DATE NOT NULL,
  allocation_percent DECIMAL(5,2) NOT NULL,
  allocated_capital DECIMAL(15,2) NOT NULL,
  reason VARCHAR(255),
  
  -- Who/what changed the allocation
  changed_by VARCHAR(100) DEFAULT 'system',
  change_type VARCHAR(50) DEFAULT 'rebalance', -- 'initial', 'rebalance', 'performance', 'manual'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create real-time bot metrics table for dashboard
CREATE TABLE IF NOT EXISTS paper_bot_metrics_realtime (
  bot_id INTEGER PRIMARY KEY REFERENCES paper_bots(id) ON DELETE CASCADE,
  
  -- Current status
  last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_capital DECIMAL(15,2) NOT NULL,
  available_buying_power DECIMAL(15,2) NOT NULL,
  
  -- Position metrics
  open_positions INTEGER DEFAULT 0,
  total_position_value DECIMAL(15,2) DEFAULT 0,
  unrealized_pnl DECIMAL(15,2) DEFAULT 0,
  
  -- Today's activity
  today_trades INTEGER DEFAULT 0,
  today_pnl DECIMAL(15,2) DEFAULT 0,
  today_signals INTEGER DEFAULT 0,
  
  -- Performance indicators
  win_streak INTEGER DEFAULT 0,
  loss_streak INTEGER DEFAULT 0,
  current_drawdown DECIMAL(10,4) DEFAULT 0,
  
  -- Strategy specific
  strategy_state JSONB DEFAULT '{}',
  last_signal_time TIMESTAMP,
  last_trade_time TIMESTAMP,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_paper_bot_performance_date ON paper_bot_performance(report_date);
CREATE INDEX IF NOT EXISTS idx_paper_bot_performance_bot_id ON paper_bot_performance(bot_id);
CREATE INDEX IF NOT EXISTS idx_paper_bot_reports_date ON paper_bot_reports(report_date, report_type);
CREATE INDEX IF NOT EXISTS idx_paper_bot_allocations_date ON paper_bot_allocations(allocation_date);
CREATE INDEX IF NOT EXISTS idx_paper_bot_allocations_bot_id ON paper_bot_allocations(bot_id);

-- Create views for easy dashboard queries

-- Bot summary view
CREATE OR REPLACE VIEW paper_bots_summary AS
SELECT 
  pb.id,
  pb.name,
  pb.strategy_name,
  pb.symbol,
  pb.status,
  pb.risk_level,
  pb.allocation_percent,
  pb.current_capital,
  pb.initial_capital,
  pb.max_positions,
  
  -- Real-time metrics
  pbmr.open_positions,
  pbmr.today_trades,
  pbmr.today_pnl,
  pbmr.unrealized_pnl,
  pbmr.current_drawdown,
  pbmr.last_heartbeat,
  
  -- Calculated fields
  (pb.current_capital - pb.initial_capital) AS total_pnl,
  CASE 
    WHEN pb.initial_capital > 0 THEN 
      ((pb.current_capital - pb.initial_capital) / pb.initial_capital) * 100 
    ELSE 0 
  END AS total_return_pct,
  
  -- Status indicators
  CASE 
    WHEN pbmr.last_heartbeat > CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 'online'
    WHEN pb.status = 'running' THEN 'stale'
    ELSE 'offline'
  END AS connection_status

FROM paper_bots pb
LEFT JOIN paper_bot_metrics_realtime pbmr ON pb.id = pbmr.bot_id
ORDER BY pb.id;

-- Daily performance view
CREATE OR REPLACE VIEW paper_bots_daily_performance AS
SELECT 
  pb.id,
  pb.name,
  pb.symbol,
  pb.strategy_name,
  pbp.report_date,
  pbp.daily_pnl,
  pbp.daily_return_pct,
  pbp.total_trades,
  pbp.win_rate,
  pbp.sharpe_ratio,
  pbp.max_drawdown

FROM paper_bots pb
LEFT JOIN paper_bot_performance pbp ON pb.id = pbp.bot_id
WHERE pbp.report_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY pbp.report_date DESC, pb.id;

-- Update triggers for real-time metrics

-- Function to update real-time metrics on trade execution
CREATE OR REPLACE FUNCTION update_bot_realtime_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update metrics when a new trade is executed
  INSERT INTO paper_bot_metrics_realtime (
    bot_id, 
    today_trades, 
    today_pnl,
    last_trade_time,
    updated_at
  ) VALUES (
    NEW.bot_id, 
    1, 
    NEW.pnl,
    NEW.executed_at,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (bot_id) DO UPDATE SET
    today_trades = paper_bot_metrics_realtime.today_trades + 1,
    today_pnl = paper_bot_metrics_realtime.today_pnl + NEW.pnl,
    last_trade_time = NEW.executed_at,
    updated_at = CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for trade updates
DROP TRIGGER IF EXISTS tr_update_bot_metrics_on_trade ON paper_trades;
CREATE TRIGGER tr_update_bot_metrics_on_trade
  AFTER INSERT ON paper_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_realtime_metrics();

-- Function to reset daily metrics at midnight
CREATE OR REPLACE FUNCTION reset_daily_bot_metrics()
RETURNS void AS $$
BEGIN
  UPDATE paper_bot_metrics_realtime SET
    today_trades = 0,
    today_pnl = 0,
    today_signals = 0,
    updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE paper_bot_performance IS 'Daily performance tracking for each paper trading bot';
COMMENT ON TABLE paper_bot_reports IS 'Generated reports for multi-bot analysis and compliance';
COMMENT ON TABLE paper_bot_allocations IS 'Historical record of capital allocation changes';
COMMENT ON TABLE paper_bot_metrics_realtime IS 'Real-time metrics for dashboard and monitoring';

-- Insert initial allocation records for existing bots
INSERT INTO paper_bot_allocations (bot_id, allocation_date, allocation_percent, allocated_capital, reason, change_type)
SELECT 
  id,
  CURRENT_DATE,
  allocation_percent,
  current_capital,
  'Initial multi-bot setup',
  'initial'
FROM paper_bots 
WHERE id NOT IN (SELECT bot_id FROM paper_bot_allocations WHERE allocation_date = CURRENT_DATE);