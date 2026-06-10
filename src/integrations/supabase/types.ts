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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          email: string
          id?: string
          reason?: string | null
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      employee_payments: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          paid_at: string
          period_month: number
          period_year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          period_month: number
          period_year: number
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          period_month?: number
          period_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          email: string | null
          employee_number: string
          full_name: string
          hired_at: string
          id: string
          job_title: string | null
          monthly_salary: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          employee_number: string
          full_name: string
          hired_at?: string
          id?: string
          job_title?: string | null
          monthly_salary?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          employee_number?: string
          full_name?: string
          hired_at?: string
          id?: string
          job_title?: string | null
          monthly_salary?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          marketer_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marketer_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marketer_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          business_id: string
          color: string | null
          commission: number
          confirmed_at: string | null
          created_at: string
          currency: Json | null
          customer_address: string | null
          customer_city: string | null
          customer_country: string | null
          customer_country_code: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          marketer_confirmed_at: string | null
          marketer_id: string
          platform_fee: number
          product_id: string
          qty: number
          receipt_uploaded_at: string | null
          receipt_url: string | null
          reviewed_at: string | null
          shipping_fee: number
          size: string | null
          status: string
          unit_price: number
        }
        Insert: {
          admin_notes?: string | null
          business_id: string
          color?: string | null
          commission?: number
          confirmed_at?: string | null
          created_at?: string
          currency?: Json | null
          customer_address?: string | null
          customer_city?: string | null
          customer_country?: string | null
          customer_country_code?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          customer_whatsapp?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          id?: string
          marketer_confirmed_at?: string | null
          marketer_id: string
          platform_fee?: number
          product_id: string
          qty?: number
          receipt_uploaded_at?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          shipping_fee?: number
          size?: string | null
          status?: string
          unit_price?: number
        }
        Update: {
          admin_notes?: string | null
          business_id?: string
          color?: string | null
          commission?: number
          confirmed_at?: string | null
          created_at?: string
          currency?: Json | null
          customer_address?: string | null
          customer_city?: string | null
          customer_country?: string | null
          customer_country_code?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          customer_whatsapp?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          id?: string
          marketer_confirmed_at?: string | null
          marketer_id?: string
          platform_fee?: number
          product_id?: string
          qty?: number
          receipt_uploaded_at?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          shipping_fee?: number
          size?: string | null
          status?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          id: string
          paid_at: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          biz_name: string | null
          business_id: string
          category: string | null
          code: string
          colors: Json
          comm_fixed: number
          comm_mode: string
          comm_pct: number
          created_at: string
          currency: Json | null
          deleted_at: string | null
          delivery: Json
          description: string | null
          id: string
          name: string
          photos: string[]
          platform_fee: number
          price: number
          qty: number
          revenue: number
          sizes: Json
          sold: number
          status: string
          total_fee_per_unit: number
          updated_at: string
          variant_groups: Json
        }
        Insert: {
          biz_name?: string | null
          business_id: string
          category?: string | null
          code: string
          colors?: Json
          comm_fixed?: number
          comm_mode?: string
          comm_pct?: number
          created_at?: string
          currency?: Json | null
          deleted_at?: string | null
          delivery?: Json
          description?: string | null
          id?: string
          name: string
          photos?: string[]
          platform_fee?: number
          price?: number
          qty?: number
          revenue?: number
          sizes?: Json
          sold?: number
          status?: string
          total_fee_per_unit?: number
          updated_at?: string
          variant_groups?: Json
        }
        Update: {
          biz_name?: string | null
          business_id?: string
          category?: string | null
          code?: string
          colors?: Json
          comm_fixed?: number
          comm_mode?: string
          comm_pct?: number
          created_at?: string
          currency?: Json | null
          deleted_at?: string | null
          delivery?: Json
          description?: string | null
          id?: string
          name?: string
          photos?: string[]
          platform_fee?: number
          price?: number
          qty?: number
          revenue?: number
          sizes?: Json
          sold?: number
          status?: string
          total_fee_per_unit?: number
          updated_at?: string
          variant_groups?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          full_name: string | null
          id: string
          payout_account_holder: string | null
          payout_account_number: string | null
          payout_bank_name: string | null
          payout_iban: string | null
          payout_method: string | null
          payout_notes: string | null
          payout_swift: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          payout_account_holder?: string | null
          payout_account_number?: string | null
          payout_bank_name?: string | null
          payout_iban?: string | null
          payout_method?: string | null
          payout_notes?: string | null
          payout_swift?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          payout_account_holder?: string | null
          payout_account_number?: string | null
          payout_bank_name?: string | null
          payout_iban?: string | null
          payout_method?: string | null
          payout_notes?: string | null
          payout_swift?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          currency: string
          pending: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          currency?: string
          pending?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          currency?: string
          pending?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_self_role: {
        Args: {
          _business_name?: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      admin_approve_order: {
        Args: { _order_id: string }
        Returns: {
          admin_notes: string | null
          business_id: string
          color: string | null
          commission: number
          confirmed_at: string | null
          created_at: string
          currency: Json | null
          customer_address: string | null
          customer_city: string | null
          customer_country: string | null
          customer_country_code: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          marketer_confirmed_at: string | null
          marketer_id: string
          platform_fee: number
          product_id: string
          qty: number
          receipt_uploaded_at: string | null
          receipt_url: string | null
          reviewed_at: string | null
          shipping_fee: number
          size: string | null
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_ban_email: {
        Args: { _email: string; _reason?: string }
        Returns: {
          banned_by: string | null
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "email_bans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_ban_user: {
        Args: { _reason?: string; _user_id: string }
        Returns: {
          banned_by: string | null
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "email_bans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_mark_payout_paid: {
        Args: { _payout_id: string }
        Returns: {
          amount: number
          id: string
          paid_at: string | null
          requested_at: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reject_order: {
        Args: { _order_id: string }
        Returns: {
          admin_notes: string | null
          business_id: string
          color: string | null
          commission: number
          confirmed_at: string | null
          created_at: string
          currency: Json | null
          customer_address: string | null
          customer_city: string | null
          customer_country: string | null
          customer_country_code: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          marketer_confirmed_at: string | null
          marketer_id: string
          platform_fee: number
          product_id: string
          qty: number
          receipt_uploaded_at: string | null
          receipt_url: string | null
          reviewed_at: string | null
          shipping_fee: number
          size: string | null
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reject_order_with_notes: {
        Args: { _notes: string; _order_id: string }
        Returns: {
          admin_notes: string | null
          business_id: string
          color: string | null
          commission: number
          confirmed_at: string | null
          created_at: string
          currency: Json | null
          customer_address: string | null
          customer_city: string | null
          customer_country: string | null
          customer_country_code: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          marketer_confirmed_at: string | null
          marketer_id: string
          platform_fee: number
          product_id: string
          qty: number
          receipt_uploaded_at: string | null
          receipt_url: string | null
          reviewed_at: string | null
          shipping_fee: number
          size: string | null
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_product_status: {
        Args: { _product_id: string; _status: string }
        Returns: {
          biz_name: string | null
          business_id: string
          category: string | null
          code: string
          colors: Json
          comm_fixed: number
          comm_mode: string
          comm_pct: number
          created_at: string
          currency: Json | null
          deleted_at: string | null
          delivery: Json
          description: string | null
          id: string
          name: string
          photos: string[]
          platform_fee: number
          price: number
          qty: number
          revenue: number
          sizes: Json
          sold: number
          status: string
          total_fee_per_unit: number
          updated_at: string
          variant_groups: Json
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_unban_email: { Args: { _email: string }; Returns: undefined }
      confirm_order: {
        Args: { _order_id: string }
        Returns: {
          admin_notes: string | null
          business_id: string
          color: string | null
          commission: number
          confirmed_at: string | null
          created_at: string
          currency: Json | null
          customer_address: string | null
          customer_city: string | null
          customer_country: string | null
          customer_country_code: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          marketer_confirmed_at: string | null
          marketer_id: string
          platform_fee: number
          product_id: string
          qty: number
          receipt_uploaded_at: string | null
          receipt_url: string | null
          reviewed_at: string | null
          shipping_fee: number
          size: string | null
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_delivered: {
        Args: { _order_id: string }
        Returns: {
          admin_notes: string | null
          business_id: string
          color: string | null
          commission: number
          confirmed_at: string | null
          created_at: string
          currency: Json | null
          customer_address: string | null
          customer_city: string | null
          customer_country: string | null
          customer_country_code: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_fee: number
          id: string
          marketer_confirmed_at: string | null
          marketer_id: string
          platform_fee: number
          product_id: string
          qty: number
          receipt_uploaded_at: string | null
          receipt_url: string | null
          reviewed_at: string | null
          shipping_fee: number
          size: string | null
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "marketer" | "business" | "admin"
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
      app_role: ["marketer", "business", "admin"],
    },
  },
} as const
