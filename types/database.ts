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
      approvals: {
        Row: {
          approved_by: string | null
          branch_id: string
          created_at: string
          decided_at: string | null
          id: string
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          request_type: Database["public"]["Enums"]["approval_type"]
          requested_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          approved_by?: string | null
          branch_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          request_type: Database["public"]["Enums"]["approval_type"]
          requested_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          request_type?: Database["public"]["Enums"]["approval_type"]
          requested_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          branch_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          prev_hash: string | null
          row_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          prev_hash?: string | null
          row_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          prev_hash?: string | null
          row_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank: Database["public"]["Enums"]["bank_code"]
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          bank: Database["public"]["Enums"]["bank_code"]
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank?: Database["public"]["Enums"]["bank_code"]
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_memberships: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          permissions: string[]
          role: Database["public"]["Enums"]["branch_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          permissions?: string[]
          role: Database["public"]["Enums"]["branch_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          permissions?: string[]
          role?: Database["public"]["Enums"]["branch_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_products: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          min_stock: number
          price: number
          product_id: string
          stock: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          price?: number
          product_id: string
          stock?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          price?: number
          product_id?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_settings: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          qris_image_url: string | null
          receipt_footer: string | null
          tax_enabled: boolean
          tax_inclusive: boolean
          tax_percent: number
          theme_font: string
          theme_preset: string
          theme_primary: string | null
          theme_radius: string
          trx_prefix: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          qris_image_url?: string | null
          receipt_footer?: string | null
          tax_enabled?: boolean
          tax_inclusive?: boolean
          tax_percent?: number
          theme_font?: string
          theme_preset?: string
          theme_primary?: string | null
          theme_radius?: string
          trx_prefix?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          qris_image_url?: string | null
          receipt_footer?: string | null
          tax_enabled?: boolean
          tax_inclusive?: boolean
          tax_percent?: number
          theme_font?: string
          theme_preset?: string
          theme_primary?: string | null
          theme_radius?: string
          trx_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_expenses: {
        Row: {
          amount: number
          branch_id: string
          cash_session_id: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          source: string
        }
        Insert: {
          amount: number
          branch_id?: string
          cash_session_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          source?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          cash_session_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_expenses_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          approved_by: string | null
          branch_id: string
          cash_session_id: string | null
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          receipt_url: string | null
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Insert: {
          amount: number
          approved_by?: string | null
          branch_id: string
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          receipt_url?: string | null
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Update: {
          amount?: number
          approved_by?: string | null
          branch_id?: string
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          receipt_url?: string | null
          type?: Database["public"]["Enums"]["cash_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          branch_id: string
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
          total_expenses: number
          total_gofood: number
          total_qris: number
          total_shopeefood: number
          total_transfer: number
          updated_at: string
          variance: number | null
        }
        Insert: {
          branch_id?: string
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
          total_expenses?: number
          total_gofood?: number
          total_qris?: number
          total_shopeefood?: number
          total_transfer?: number
          updated_at?: string
          variance?: number | null
        }
        Update: {
          branch_id?: string
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
          total_expenses?: number
          total_gofood?: number
          total_qris?: number
          total_shopeefood?: number
          total_transfer?: number
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
      daily_closures: {
        Row: {
          branch_id: string
          business_date: string
          closed_at: string
          closed_by: string | null
          id: string
          is_locked: boolean
          totals: Json
        }
        Insert: {
          branch_id: string
          business_date: string
          closed_at?: string
          closed_by?: string | null
          id?: string
          is_locked?: boolean
          totals?: Json
        }
        Update: {
          branch_id?: string
          business_date?: string
          closed_at?: string
          closed_by?: string | null
          id?: string
          is_locked?: boolean
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_closures_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          cost_price: number | null
          id: string
          product_id: string
          qty: number
          receipt_id: string
        }
        Insert: {
          cost_price?: number | null
          id?: string
          product_id: string
          qty: number
          receipt_id: string
        }
        Update: {
          cost_price?: number | null
          id?: string
          product_id?: string
          qty?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          branch_id: string
          code: string
          created_at: string
          id: string
          note: string | null
          received_at: string | null
          received_by: string | null
          status: Database["public"]["Enums"]["goods_receipt_status"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          code: string
          created_at?: string
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["goods_receipt_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          code?: string
          created_at?: string
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["goods_receipt_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          created_at: string
          default_adjustment_threshold: number
          default_discount_threshold: number
          id: string
          logo_url: string | null
          org_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_adjustment_threshold?: number
          default_discount_threshold?: number
          id?: string
          logo_url?: string | null
          org_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_adjustment_threshold?: number
          default_discount_threshold?: number
          id?: string
          logo_url?: string | null
          org_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bank: Database["public"]["Enums"]["bank_code"] | null
          branch_id: string
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
          branch_id?: string
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
          branch_id?: string
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
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          base_cost_price: number | null
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
          base_cost_price?: number | null
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
          base_cost_price?: number | null
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
          is_master_admin: boolean
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
          is_master_admin?: boolean
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
          is_master_admin?: boolean
          permissions?: string[]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          prev_hash: string | null
          product_id: string
          qty_change: number
          reference_id: string | null
          row_hash: string | null
          stock_after: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          prev_hash?: string | null
          product_id: string
          qty_change: number
          reference_id?: string | null
          row_hash?: string | null
          stock_after: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          prev_hash?: string | null
          product_id?: string
          qty_change?: number
          reference_id?: string | null
          row_hash?: string | null
          stock_after?: number
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          branch_id: string
          code: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          status: Database["public"]["Enums"]["opname_status"]
        }
        Insert: {
          branch_id?: string
          code: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["opname_status"]
        }
        Update: {
          branch_id?: string
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
            foreignKeyName: "stock_opnames_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opnames_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          id: string
          product_id: string
          qty: number
          transfer_id: string
        }
        Insert: {
          id?: string
          product_id: string
          qty: number
          transfer_id: string
        }
        Update: {
          id?: string
          product_id?: string
          qty?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          from_branch_id: string
          id: string
          note: string | null
          received_at: string | null
          received_by: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_branch_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          from_branch_id: string
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_branch_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          from_branch_id?: string
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_branch_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_dispatched_by_fkey"
            columns: ["dispatched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
          theme_font: string
          theme_preset: string
          theme_primary: string | null
          theme_radius: string
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
          theme_font?: string
          theme_preset?: string
          theme_primary?: string | null
          theme_radius?: string
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
          theme_font?: string
          theme_preset?: string
          theme_primary?: string | null
          theme_radius?: string
          trx_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          phone?: string | null
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
          branch_id: string
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
          prev_hash: string | null
          reversal_of: string | null
          row_hash: string | null
          seq_no: number | null
          shipping_cost: number
          status: Database["public"]["Enums"]["transaction_status"]
          subtotal: number
          tax_total: number
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          branch_id?: string
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
          prev_hash?: string | null
          reversal_of?: string | null
          row_hash?: string | null
          seq_no?: number | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_total?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          branch_id?: string
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
          prev_hash?: string | null
          reversal_of?: string | null
          row_hash?: string | null
          seq_no?: number | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_total?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "transactions"
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
      wastage_items: {
        Row: {
          id: string
          product_id: string
          qty: number
          wastage_id: string
        }
        Insert: {
          id?: string
          product_id: string
          qty: number
          wastage_id: string
        }
        Update: {
          id?: string
          product_id?: string
          qty?: number
          wastage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wastage_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_items_wastage_id_fkey"
            columns: ["wastage_id"]
            isOneToOne: false
            referencedRelation: "wastages"
            referencedColumns: ["id"]
          },
        ]
      }
      wastages: {
        Row: {
          approved_by: string | null
          branch_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          photo_url: string | null
          reason: string | null
          status: Database["public"]["Enums"]["wastage_status"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          branch_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          photo_url?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["wastage_status"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          branch_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          photo_url?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["wastage_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wastages_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      branch_products_public: {
        Row: {
          barcode: string | null
          branch_id: string | null
          category_id: string | null
          deleted_at: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_taxable: boolean | null
          min_stock: number | null
          name: string | null
          price: number | null
          product_id: string | null
          sku: string | null
          stock: number | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
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
        Args: {
          p_branch_id?: string
          p_new_qty: number
          p_note?: string
          p_product_id: string
        }
        Returns: Json
      }
      branch_seq_gaps: {
        Args: never
        Returns: {
          branch_id: string
          branch_name: string
          max_seq: number
          missing: number
          trx_count: number
        }[]
      }
      close_daily: {
        Args: { p_branch_id: string; p_business_date: string }
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
          p_shipping_cost?: number
        }
        Returns: Json
      }
      dashboard_analytics: {
        Args: { p_bucket?: string; p_from: string; p_to: string }
        Returns: Json
      }
      dashboard_kpis: { Args: never; Returns: Json }
      has_branch_permission: {
        Args: { b: string; perm: string }
        Returns: boolean
      }
      has_branch_role: {
        Args: { b: string; r: Database["public"]["Enums"]["branch_role"] }
        Returns: boolean
      }
      has_permission: { Args: { perm: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_master_admin: { Args: never; Returns: boolean }
      refund_sale: {
        Args: { p_reason?: string; p_transaction_id: string }
        Returns: Json
      }
      restock_product: {
        Args: {
          p_branch_id?: string
          p_new_cost?: number
          p_note?: string
          p_product_id: string
          p_qty: number
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_branch_ids: { Args: never; Returns: string[] }
      void_sale: {
        Args: { p_reason?: string; p_transaction_id: string }
        Returns: Json
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected"
      approval_type:
        | "void"
        | "refund"
        | "discount_override"
        | "price_override"
        | "stock_adjustment"
        | "no_sale"
      bank_code: "BNI" | "BCA" | "BSI"
      branch_role: "manager" | "cashier"
      cash_movement_type: "drop" | "pettycash_out" | "expense" | "float_in"
      discount_type: "none" | "amount" | "percent"
      goods_receipt_status: "draft" | "received" | "cancelled"
      movement_type:
        | "initial"
        | "sale"
        | "void"
        | "refund"
        | "opname"
        | "adjustment"
        | "restock"
      opname_status: "draft" | "completed"
      payment_method: "cash" | "qris" | "transfer" | "gofood" | "shopeefood"
      session_status: "open" | "closed"
      transaction_status: "completed" | "void" | "refunded"
      transfer_status: "draft" | "dispatched" | "received" | "cancelled"
      user_role: "admin" | "kasir"
      wastage_status: "pending_approval" | "approved" | "rejected"
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
      approval_status: ["pending", "approved", "rejected"],
      approval_type: [
        "void",
        "refund",
        "discount_override",
        "price_override",
        "stock_adjustment",
        "no_sale",
      ],
      bank_code: ["BNI", "BCA", "BSI"],
      branch_role: ["manager", "cashier"],
      cash_movement_type: ["drop", "pettycash_out", "expense", "float_in"],
      discount_type: ["none", "amount", "percent"],
      goods_receipt_status: ["draft", "received", "cancelled"],
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
      payment_method: ["cash", "qris", "transfer", "gofood", "shopeefood"],
      session_status: ["open", "closed"],
      transaction_status: ["completed", "void", "refunded"],
      transfer_status: ["draft", "dispatched", "received", "cancelled"],
      user_role: ["admin", "kasir"],
      wastage_status: ["pending_approval", "approved", "rejected"],
    },
  },
} as const
