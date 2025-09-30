export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          api_key: string
          api_secret: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          last_tested_at: string | null
          mode: Database["public"]["Enums"]["trading_mode"] | null
          provider: Database["public"]["Enums"]["api_provider"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key: string
          api_secret?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_tested_at?: string | null
          mode?: Database["public"]["Enums"]["trading_mode"] | null
          provider: Database["public"]["Enums"]["api_provider"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string
          api_secret?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_tested_at?: string | null
          mode?: Database["public"]["Enums"]["trading_mode"] | null
          provider?: Database["public"]["Enums"]["api_provider"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          id: string
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      risk_controls: {
        Row: {
          auto_kill_data_loss_seconds: number | null
          auto_kill_pnl_spike_pct: number | null
          created_at: string | null
          daily_loss_limit_usd: number | null
          id: string
          max_drawdown_pct: number | null
          max_hold_time_minutes: number | null
          max_position_size_usd: number | null
          max_positions: number | null
          max_spread_cents: number | null
          min_open_interest: number | null
          monthly_loss_limit_usd: number | null
          pre_expiry_close_minutes: number | null
          trading_end_time: string | null
          trading_start_time: string | null
          updated_at: string | null
          user_id: string
          weekly_loss_limit_usd: number | null
        }
        Insert: {
          auto_kill_data_loss_seconds?: number | null
          auto_kill_pnl_spike_pct?: number | null
          created_at?: string | null
          daily_loss_limit_usd?: number | null
          id?: string
          max_drawdown_pct?: number | null
          max_hold_time_minutes?: number | null
          max_position_size_usd?: number | null
          max_positions?: number | null
          max_spread_cents?: number | null
          min_open_interest?: number | null
          monthly_loss_limit_usd?: number | null
          pre_expiry_close_minutes?: number | null
          trading_end_time?: string | null
          trading_start_time?: string | null
          updated_at?: string | null
          user_id: string
          weekly_loss_limit_usd?: number | null
        }
        Update: {
          auto_kill_data_loss_seconds?: number | null
          auto_kill_pnl_spike_pct?: number | null
          created_at?: string | null
          daily_loss_limit_usd?: number | null
          id?: string
          max_drawdown_pct?: number | null
          max_hold_time_minutes?: number | null
          max_position_size_usd?: number | null
          max_positions?: number | null
          max_spread_cents?: number | null
          min_open_interest?: number | null
          monthly_loss_limit_usd?: number | null
          pre_expiry_close_minutes?: number | null
          trading_end_time?: string | null
          trading_start_time?: string | null
          updated_at?: string | null
          user_id?: string
          weekly_loss_limit_usd?: number | null
        }
        Relationships: []
      }
      strategy_defaults: {
        Row: {
          created_at: string | null
          ema_length: number | null
          entry_deviation_pct: number | null
          id: string
          min_slope: number | null
          near_deviation_pct: number | null
          rv_cap_bps: number | null
          time_stop_bars: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          ema_length?: number | null
          entry_deviation_pct?: number | null
          id?: string
          min_slope?: number | null
          near_deviation_pct?: number | null
          rv_cap_bps?: number | null
          time_stop_bars?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          ema_length?: number | null
          entry_deviation_pct?: number | null
          id?: string
          min_slope?: number | null
          near_deviation_pct?: number | null
          rv_cap_bps?: number | null
          time_stop_bars?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      api_provider: "polygon" | "alpaca" | "openai"
      trading_mode: "paper" | "live"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      api_provider: ["polygon", "alpaca", "openai"],
      trading_mode: ["paper", "live"],
    },
  },
} as const
