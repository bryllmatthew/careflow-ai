export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          organization_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          organization_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          organization_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_conversation_org_fk"
            columns: ["conversation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      ai_tool_calls: {
        Row: {
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          input: Json
          is_action: boolean
          message_id: string | null
          organization_id: string
          output_summary: Json | null
          status: string
          tool_name: string
          tool_use_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          is_action?: boolean
          message_id?: string | null
          organization_id: string
          output_summary?: Json | null
          status: string
          tool_name: string
          tool_use_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          is_action?: boolean
          message_id?: string | null
          organization_id?: string
          output_summary?: Json | null
          status?: string
          tool_name?: string
          tool_use_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_calls_conversation_org_fk"
            columns: ["conversation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          input_tokens: number
          model: string
          organization_id: string
          output_tokens: number
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          organization_id: string
          output_tokens?: number
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          organization_id?: string
          output_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          end_at: string
          id: string
          notes: string | null
          organization_id: string
          patient_id: string
          service_id: string
          staff_id: string
          start_at: string
          status: string
          time_range: unknown
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          end_at: string
          id?: string
          notes?: string | null
          organization_id: string
          patient_id: string
          service_id: string
          staff_id: string
          start_at: string
          status?: string
          time_range?: unknown
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          end_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string
          service_id?: string
          staff_id?: string
          start_at?: string
          status?: string
          time_range?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_fk"
            columns: ["patient_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_service_fk"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_key: string
          action_type: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          organization_id: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_key: string
          action_type: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          organization_id: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          action_type?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          organization_id?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          operating_hours: Json
          organization_id: string
          phone: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          operating_hours?: Json
          organization_id: string
          phone?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          operating_hours?: Json
          organization_id?: string
          phone?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          document_type: string
          last_number: number
          organization_id: string
          year: number
        }
        Insert: {
          document_type: string
          last_number?: number
          organization_id: string
          year: number
        }
        Update: {
          document_type?: string
          last_number?: number
          organization_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          automation_rule_id: string | null
          clinic_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          organization_id: string
          patient_id: string
          priority: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          automation_rule_id?: string | null
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          organization_id: string
          patient_id: string
          priority?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          automation_rule_id?: string | null
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          organization_id?: string
          patient_id?: string
          priority?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_appointment_fk"
            columns: ["appointment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "follow_ups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_invoice_fk"
            columns: ["invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "follow_ups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_fk"
            columns: ["patient_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      inventory: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_low_stock: boolean | null
          last_received_at: string | null
          last_used_at: string | null
          organization_id: string
          product_id: string
          quantity_on_hand: number
          reorder_level: number
          reorder_quantity: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_low_stock?: boolean | null
          last_received_at?: string | null
          last_used_at?: string | null
          organization_id: string
          product_id: string
          quantity_on_hand?: number
          reorder_level?: number
          reorder_quantity?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_low_stock?: boolean | null
          last_received_at?: string | null
          last_used_at?: string | null
          organization_id?: string
          product_id?: string
          quantity_on_hand?: number
          reorder_level?: number
          reorder_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string | null
          clinic_id: string
          created_at: string
          expiration_date: string | null
          id: string
          lot_number: string | null
          organization_id: string
          product_id: string
          quantity_remaining: number
          received_at: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          clinic_id: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          lot_number?: string | null
          organization_id: string
          product_id: string
          quantity_remaining?: number
          received_at?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          clinic_id?: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          lot_number?: string | null
          organization_id?: string
          product_id?: string
          quantity_remaining?: number
          received_at?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_number: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          expiration_date: string | null
          id: string
          lot_number: string | null
          movement_type: string
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id: string | null
          reference_type: string | null
          total_cost: number | null
          transfer_group_id: string | null
          unit_cost: number | null
        }
        Insert: {
          batch_number?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          lot_number?: string | null
          movement_type: string
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id?: string | null
          reference_type?: string | null
          total_cost?: number | null
          transfer_group_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          batch_number?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          lot_number?: string | null
          movement_type?: string
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string | null
          total_cost?: number | null
          transfer_group_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          clinic_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number | null
          organization_id: string
          quantity: number
          service_id: string | null
          unit_price: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number | null
          organization_id: string
          quantity?: number
          service_id?: string | null
          unit_price: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number | null
          organization_id?: string
          quantity?: number
          service_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_fk"
            columns: ["invoice_id", "organization_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id", "clinic_id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_fk"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          appointment_id: string | null
          balance: number | null
          clinic_id: string
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          discount_type: string | null
          discount_value: number | null
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          organization_id: string
          patient_id: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_paid?: number
          appointment_id?: string | null
          balance?: number | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          notes?: string | null
          organization_id: string
          patient_id: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_paid?: number
          appointment_id?: string | null
          balance?: number | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          notes?: string | null
          organization_id?: string
          patient_id?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_fk"
            columns: ["appointment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_fk"
            columns: ["patient_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          organization_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          organization_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          business_type: string
          created_at: string
          currency: string
          deleted_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_type?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_type?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          address: string | null
          assigned_staff_id: string | null
          clinic_id: string
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          search_text: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_staff_id?: string | null
          clinic_id: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          search_text?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_staff_id?: string | null
          clinic_id?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          search_text?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string
          metadata: Json
          organization_id: string
          paid_at: string | null
          patient_id: string
          payment_method: string
          provider: string
          provider_payment_intent_id: string | null
          provider_transaction_id: string | null
          reference_number: string | null
          refunded_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          clinic_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          failure_reason?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          organization_id: string
          paid_at?: string | null
          patient_id: string
          payment_method: string
          provider?: string
          provider_payment_intent_id?: string | null
          provider_transaction_id?: string | null
          reference_number?: string | null
          refunded_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          organization_id?: string
          paid_at?: string | null
          patient_id?: string
          payment_method?: string
          provider?: string
          provider_payment_intent_id?: string | null
          provider_transaction_id?: string | null
          reference_number?: string | null
          refunded_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_fk"
            columns: ["invoice_id", "organization_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id", "clinic_id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_fk"
            columns: ["patient_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          description: string
          key: string
        }
        Insert: {
          category: string
          description: string
          key: string
        }
        Update: {
          category?: string
          description?: string
          key?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          organization_id: string
          reorder_level: number
          reorder_quantity: number
          selling_price: number | null
          sku: string | null
          status: string
          supplier_id: string | null
          supplier_sku: string | null
          track_expiration: boolean
          track_inventory: boolean
          unit_cost: number
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          reorder_level?: number
          reorder_quantity?: number
          selling_price?: number | null
          sku?: string | null
          status?: string
          supplier_id?: string | null
          supplier_sku?: string | null
          track_expiration?: boolean
          track_inventory?: boolean
          unit_cost?: number
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          reorder_level?: number
          reorder_quantity?: number
          selling_price?: number | null
          sku?: string | null
          status?: string
          supplier_id?: string | null
          supplier_sku?: string | null
          track_expiration?: boolean
          track_inventory?: boolean
          unit_cost?: number
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_fk"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          clinic_id: string
          created_at: string
          description: string
          id: string
          organization_id: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          total_cost?: number | null
          unit_cost: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          product_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_fk"
            columns: ["purchase_order_id", "organization_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "organization_id", "clinic_id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string | null
          organization_id: string
          purchase_order_number: string | null
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          organization_id: string
          purchase_order_number?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          organization_id?: string
          purchase_order_number?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_fk"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          clinic_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          failure_reason: string | null
          id: string
          invoice_id: string
          organization_id: string
          payment_id: string
          provider_refund_id: string | null
          reason: string
          status: string
        }
        Insert: {
          amount: number
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id: string
          organization_id: string
          payment_id: string
          provider_refund_id?: string | null
          reason: string
          status?: string
        }
        Update: {
          amount?: number
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          organization_id?: string
          payment_id?: string
          provider_refund_id?: string | null
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_invoice_fk"
            columns: ["invoice_id", "organization_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id", "clinic_id"]
          },
          {
            foreignKeyName: "refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_fk"
            columns: ["payment_id", "organization_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "organization_id", "clinic_id"]
          },
        ]
      }
      reminder_templates: {
        Row: {
          action_key: string
          body: string
          channel: string
          created_at: string
          enabled: boolean
          id: string
          name: string
          organization_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          action_key: string
          body: string
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          organization_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          action_key?: string
          body?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          organization_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          appointment_id: string
          automation_rule_id: string | null
          channel: string
          clinic_id: string
          created_at: string
          failure_reason: string | null
          id: string
          organization_id: string
          patient_id: string
          reminder_type: string
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          automation_rule_id?: string | null
          channel?: string
          clinic_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          organization_id: string
          patient_id: string
          reminder_type: string
          retry_count?: number
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          automation_rule_id?: string | null
          channel?: string
          clinic_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          organization_id?: string
          patient_id?: string
          reminder_type?: string
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_appointment_fk"
            columns: ["appointment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reminders_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_patient_fk"
            columns: ["patient_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_products: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_products_product_fk"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_products_service_fk"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      services: {
        Row: {
          clinic_id: string
          cost: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          name: string
          organization_id: string
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          name: string
          organization_id: string
          price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          organization_id?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinic_id: string | null
          created_at: string
          id: string
          organization_id: string
          role_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          role_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinic_fk"
            columns: ["clinic_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          organization_id?: string | null
          payload: Json
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_organization_id: string }; Returns: undefined }
      adjust_inventory: {
        Args: {
          p_batch_id?: string
          p_clinic_id: string
          p_movement_type: string
          p_product_id: string
          p_quantity_delta: number
          p_reason: string
        }
        Returns: string
      }
      consume_inventory_for_appointment: {
        Args: { p_appointment_id: string }
        Returns: {
          out_product_id: string
          out_product_name: string
          out_quantity_after: number
          out_quantity_before: number
          out_quantity_used: number
          out_reorder_level: number
        }[]
      }
      create_notification: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_message: string
          p_organization_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_business_type?: string
          p_clinic_name?: string
          p_org_name: string
        }
        Returns: string
      }
      grant_user_role: {
        Args: {
          p_clinic_id?: string
          p_organization_id: string
          p_role_id: string
          p_target_user: string
        }
        Returns: string
      }
      has_permission: {
        Args: {
          p_clinic_id?: string
          p_organization_id: string
          p_permission: string
        }
        Returns: boolean
      }
      invite_member: {
        Args: {
          p_organization_id: string
          p_role_id?: string
          p_user_id: string
        }
        Returns: string
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_organization_id: string
        }
        Returns: string
      }
      my_permissions: { Args: { p_organization_id: string }; Returns: string[] }
      patient_search_text: {
        Args: {
          p_email: string
          p_first_name: string
          p_id: string
          p_last_name: string
          p_phone: string
        }
        Returns: string
      }
      receive_purchase_order_item: {
        Args: {
          p_batch_number?: string
          p_expiration_date?: string
          p_item_id: string
          p_lot_number?: string
          p_notes?: string
          p_quantity: number
        }
        Returns: string
      }
      receive_stock: {
        Args: {
          p_batch_number?: string
          p_clinic_id: string
          p_expiration_date?: string
          p_lot_number?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_unit_cost?: number
        }
        Returns: string
      }
      record_manual_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_payment_method: string
          p_reference_number?: string
        }
        Returns: string
      }
      record_refund: {
        Args: { p_amount: number; p_payment_id: string; p_reason: string }
        Returns: string
      }
      revoke_user_role: { Args: { p_user_role_id: string }; Returns: undefined }
      set_membership_status: {
        Args: { p_membership_id: string; p_status: string }
        Returns: undefined
      }
      transfer_inventory: {
        Args: {
          p_from_clinic_id: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_to_clinic_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

