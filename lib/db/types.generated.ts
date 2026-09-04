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

