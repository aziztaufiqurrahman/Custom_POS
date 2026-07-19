// File ini di-generate dari skema Supabase (jangan diedit manual).
// Regenerate: npx supabase gen types typescript --project-id <ref> > types/database.ts

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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank: Database["public"]["Enums"]["bank_code"]
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          bank: Database["public"]["Enums"]["bank_code"]
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank?: Database["public"]["Enums"]["bank_code"]
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cash_sessions: {
        Row: {
          cashier_id: string
          closed_at: string | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          note: string | null
          opened_at: string
          opening_balance: number
          status: Database["public"]["Enums"]["session_status"]
          total_cash: number
          total_qris: number
          total_transfer: number
          updated_at: string
          variance: number | null
        }
        Insert: {
          cashier_id: string
          closed_at?: string | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opening_balance?: number
          status?: Database["public"]["Enums"]["session_status"]
          total_cash?: number
          total_qris?: number
          total_transfer?: number
          updated_at?: string
          variance?: number | null
        }
        Update: {
          cashier_id?: string
          closed_at?: string | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opening_balance?: number
          status?: Database["public"]["Enums"]["session_status"]
          total_cash?: number
          total_qris?: number
          total_transfer?: number
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank: Database["public"]["Enums"]["bank_code"] | null
          cash_received: number | null
          change_given: number | null
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          bank?: Database["public"]["Enums"]["bank_code"] | null
          cash_received?: number | null
          change_given?: number | null
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          bank?: Database["public"]["Enums"]["bank_code"] | null
          cash_received?: number | null
          change_given?: number | null
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          image_url: string | null
          image_urls: string[]
          is_active: boolean
          is_taxable: boolean
          min_stock: number
          name: string
          sell_price: number
          sku: string
          stock: number
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          image_url?: string | null
          image_urls?: string[]
          is_active?: boolean
          is_taxable?: boolean
          min_stock?: number
          name: string
          sell_price?: number
          sku: string
          stock?: number
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          image_url?: string | null
          image_urls?: string[]
          is_active?: boolean
          is_taxable?: boolean
          min_stock?: number
          name?: string
          sell_price?: number
          sku?: string
          stock?: number
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          permissions: string[]
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          permissions?: string[]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          permissions?: string[]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          product_id: string
          qty_change: number
          reference_id: string | null
          stock_after: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id: string
          qty_change: number
          reference_id?: string | null
          stock_after: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string
          qty_change?: number
          reference_id?: string | null
          stock_after?: number
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_items: {
        Row: {
          difference: number
          id: string
          opname_id: string
          physical_qty: number
          product_id: string
          reason: string | null
          system_qty: number
        }
        Insert: {
          difference?: number
          id?: string
          opname_id: string
          physical_qty?: number
          product_id: string
          reason?: string | null
          system_qty?: number
        }
        Update: {
          difference?: number
          id?: string
          opname_id?: string
          physical_qty?: number
          product_id?: string
          reason?: string | null
          system_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_opname_items_opname_id_fkey"
            columns: ["opname_id"]
            isOneToOne: false
            referencedRelation: "stock_opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opnames: {
        Row: {
          code: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          status: Database["public"]["Enums"]["opname_status"]
        }
        Insert: {
          code: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["opname_status"]
        }
        Update: {
          code?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["opname_status"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_opnames_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          id: string
          logo_url: string | null
          phone: string | null
          qris_image_url: string | null
          receipt_footer: string | null
          store_name: string
          tax_enabled: boolean
          tax_inclusive: boolean
          tax_percent: number
          trx_prefix: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          qris_image_url?: string | null
          receipt_footer?: string | null
          store_name?: string
          tax_enabled?: boolean
          tax_inclusive?: boolean
          tax_percent?: number
          trx_prefix?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          qris_image_url?: string | null
          receipt_footer?: string | null
          store_name?: string
          tax_enabled?: boolean
          tax_inclusive?: boolean
          tax_percent?: number
          trx_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      transaction_items: {
        Row: {
          discount: number
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          qty: number
          sku_snapshot: string | null
          transaction_id: string
          unit_price: number
        }
        Insert: {
          discount?: number
          id?: string
          line_total: number
          product_id?: string | null
          product_name_snapshot: string
          qty: number
          sku_snapshot?: string | null
          transaction_id: string
          unit_price: number
        }
        Update: {
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          qty?: number
          sku_snapshot?: string | null
          transaction_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          cash_session_id: string | null
          cashier_id: string
          code: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          discount_total: number
          grand_total: number
          id: string
          note: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          subtotal: number
          tax_total: number
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          cash_session_id?: string | null
          cashier_id: string
          code: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_total?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          cash_session_id?: string | null
          cashier_id?: string
          code?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_total?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      products_public: {
        Row: {
          barcode: string | null
          category_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number | null
          id: string | null
          image_url: string | null
          image_urls: string[] | null
          is_active: boolean | null
          is_taxable: boolean | null
          min_stock: number | null
          name: string | null
          sell_price: number | null
          sku: string | null
          stock: number | null
          supplier: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          id?: string | null
          image_url?: string | null
          image_urls?: string[] | null
          is_active?: boolean | null
          is_taxable?: boolean | null
          min_stock?: number | null
          name?: string | null
          sell_price?: number | null
          sku?: string | null
          stock?: number | null
          supplier?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          id?: string | null
          image_url?: string | null
          image_urls?: string[] | null
          is_active?: boolean | null
          is_taxable?: boolean | null
          min_stock?: number | null
          name?: string | null
          sell_price?: number | null
          sku?: string | null
          stock?: number | null
          supplier?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: { p_new_qty: number; p_note?: string; p_product_id: string }
        Returns: Json
      }
      complete_opname: {
        Args: { p_items: Json; p_opname_id: string }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_cash_session_id: string
          p_customer_name?: string
          p_customer_phone?: string
          p_items: Json
          p_note?: string
          p_order_discount?: number
          p_payment: Json
        }
        Returns: Json
      }
      dashboard_analytics: {
        Args: { p_bucket?: string; p_from: string; p_to: string }
        Returns: Json
      }
      dashboard_kpis: { Args: never; Returns: Json }
      has_permission: { Args: { perm: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      refund_sale: {
        Args: { p_reason?: string; p_transaction_id: string }
        Returns: Json
      }
      restock_product: {
        Args: {
          p_new_cost?: number
          p_note?: string
          p_product_id: string
          p_qty: number
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      void_sale: {
        Args: { p_reason?: string; p_transaction_id: string }
        Returns: Json
      }
    }
    Enums: {
      bank_code: "BNI" | "BCA" | "BSI"
      discount_type: "none" | "amount" | "percent"
      movement_type:
        | "initial"
        | "sale"
        | "void"
        | "refund"
        | "opname"
        | "adjustment"
        | "restock"
      opname_status: "draft" | "completed"
      payment_method: "cash" | "qris" | "transfer"
      session_status: "open" | "closed"
      transaction_status: "completed" | "void" | "refunded"
      user_role: "admin" | "kasir"
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
      bank_code: ["BNI", "BCA", "BSI"],
      discount_type: ["none", "amount", "percent"],
      movement_type: [
        "initial",
        "sale",
        "void",
        "refund",
        "opname",
        "adjustment",
        "restock",
      ],
      opname_status: ["draft", "completed"],
      payment_method: ["cash", "qris", "transfer"],
      session_status: ["open", "closed"],
      transaction_status: ["completed", "void", "refunded"],
      user_role: ["admin", "kasir"],
    },
  },
} as const
