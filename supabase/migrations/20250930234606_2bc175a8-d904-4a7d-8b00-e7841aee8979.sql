-- Create backtest_runs table
CREATE TABLE public.backtest_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  timeframe TEXT NOT NULL,
  initial_capital NUMERIC NOT NULL,
  commission_per_contract NUMERIC NOT NULL DEFAULT 0.65,
  slippage_pct NUMERIC NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'pending',
  total_return_pct NUMERIC,
  sharpe_ratio NUMERIC,
  max_drawdown_pct NUMERIC,
  win_rate_pct NUMERIC,
  total_trades INTEGER,
  avg_win NUMERIC,
  avg_loss NUMERIC,
  profit_factor NUMERIC,
  final_equity NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backtest_runs
CREATE POLICY "Users can view their own backtest runs"
ON public.backtest_runs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own backtest runs"
ON public.backtest_runs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own backtest runs"
ON public.backtest_runs
FOR UPDATE
USING (auth.uid() = user_id);

-- Create backtest_trades table
CREATE TABLE public.backtest_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backtest_run_id UUID NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
  exit_time TIMESTAMP WITH TIME ZONE NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  pnl NUMERIC NOT NULL,
  return_pct NUMERIC NOT NULL,
  commission NUMERIC NOT NULL,
  slippage NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.backtest_trades ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backtest_trades
CREATE POLICY "Users can view trades from their backtest runs"
ON public.backtest_trades
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.backtest_runs
    WHERE backtest_runs.id = backtest_trades.backtest_run_id
    AND backtest_runs.user_id = auth.uid()
  )
);

-- Create strategy_parameters table
CREATE TABLE public.strategy_parameters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_name TEXT NOT NULL,
  parameters JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.strategy_parameters ENABLE ROW LEVEL SECURITY;

-- RLS Policies for strategy_parameters
CREATE POLICY "Users can view their own strategy parameters"
ON public.strategy_parameters
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategy parameters"
ON public.strategy_parameters
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy parameters"
ON public.strategy_parameters
FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_strategy_parameters_updated_at
BEFORE UPDATE ON public.strategy_parameters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_backtest_runs_user_id ON public.backtest_runs(user_id);
CREATE INDEX idx_backtest_runs_status ON public.backtest_runs(status);
CREATE INDEX idx_backtest_trades_run_id ON public.backtest_trades(backtest_run_id);
CREATE INDEX idx_strategy_parameters_user_id ON public.strategy_parameters(user_id);