export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      generations: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          kind: string;
          model: string;
          params: Json;
          prompt: string;
          status: string;
          storage_path: string | null;
          updated_at: string;
          user_id: string;
          virtual_model_id: string | null;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: string;
          model?: string;
          params?: Json;
          prompt?: string;
          status?: string;
          storage_path?: string | null;
          updated_at?: string;
          user_id: string;
          virtual_model_id?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          model?: string;
          params?: Json;
          prompt?: string;
          status?: string;
          storage_path?: string | null;
          updated_at?: string;
          user_id?: string;
          virtual_model_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "generations_virtual_model_id_fkey";
            columns: ["virtual_model_id"];
            isOneToOne: false;
            referencedRelation: "virtual_models";
            referencedColumns: ["id"];
          },
        ];
      };
      job_runner: {
        Row: {
          app_base_url: string | null;
          id: string;
          lock_until: string | null;
          paused: boolean;
          paused_at: string | null;
          paused_reason: string | null;
          updated_at: string;
          worker_token: string | null;
        };
        Insert: {
          app_base_url?: string | null;
          id: string;
          lock_until?: string | null;
          paused?: boolean;
          paused_at?: string | null;
          paused_reason?: string | null;
          updated_at?: string;
          worker_token?: string | null;
        };
        Update: {
          app_base_url?: string | null;
          id?: string;
          lock_until?: string | null;
          paused?: boolean;
          paused_at?: string | null;
          paused_reason?: string | null;
          updated_at?: string;
          worker_token?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          generation_id: string | null;
          id: string;
          input: Json;
          kind: string;
          lease_until: string | null;
          max_attempts: number;
          next_run_at: string;
          result: Json | null;
          state: Json;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          generation_id?: string | null;
          id?: string;
          input?: Json;
          kind: string;
          lease_until?: string | null;
          max_attempts?: number;
          next_run_at?: string;
          result?: Json | null;
          state?: Json;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          generation_id?: string | null;
          id?: string;
          input?: Json;
          kind?: string;
          lease_until?: string | null;
          max_attempts?: number;
          next_run_at?: string;
          result?: Json | null;
          state?: Json;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          onboarding_completed: boolean;
          purpose: string | null;
          role: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          onboarding_completed?: boolean;
          purpose?: string | null;
          role?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          onboarding_completed?: boolean;
          purpose?: string | null;
          role?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      provider_secrets: {
        Row: {
          created_at: string;
          name: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          name: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          name?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      social_connections: {
        Row: {
          access_token: string | null;
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          external_id: string;
          id: string;
          metadata: Json;
          provider: string;
          scopes: string[];
          status: string;
          token_expires_at: string | null;
          updated_at: string;
          user_id: string;
          username: string | null;
        };
        Insert: {
          access_token?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          external_id: string;
          id?: string;
          metadata?: Json;
          provider: string;
          scopes?: string[];
          status?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          user_id: string;
          username?: string | null;
        };
        Update: {
          access_token?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          external_id?: string;
          id?: string;
          metadata?: Json;
          provider?: string;
          scopes?: string[];
          status?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          audio_credits: number;
          cancel_at_period_end: boolean;
          created_at: string;
          credits_used: number;
          current_period_end: string;
          current_period_start: string;
          id: string;
          image_credits: number;
          monthly_quota: number;
          payment_status: string;
          provider: string | null;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          tier: Database["public"]["Enums"]["plan_tier"];
          updated_at: string;
          user_id: string;
          video_credits: number;
        };
        Insert: {
          audio_credits?: number;
          cancel_at_period_end?: boolean;
          created_at?: string;
          credits_used?: number;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          image_credits?: number;
          monthly_quota?: number;
          payment_status?: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          tier?: Database["public"]["Enums"]["plan_tier"];
          updated_at?: string;
          user_id: string;
          video_credits?: number;
        };
        Update: {
          audio_credits?: number;
          cancel_at_period_end?: boolean;
          created_at?: string;
          credits_used?: number;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          image_credits?: number;
          monthly_quota?: number;
          payment_status?: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          tier?: Database["public"]["Enums"]["plan_tier"];
          updated_at?: string;
          user_id?: string;
          video_credits?: number;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          aspect_ratio: string;
          bitrate: string;
          caption_scale: number;
          caption_style: string;
          captions: boolean;
          created_at: string;
          direct_download_url: string | null;
          duration_seconds: number;
          error: string | null;
          file_id: string | null;
          id: string;
          image_style: string;
          logs: Json;
          motion_template: string;
          negative_prompt: string;
          progress: number;
          prompt: string;
          quality: string;
          status: string;
          step: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
          video_url: string | null;
          voice_gender: string;
          voice_persona: string;
          voice_pitch: number;
          voice_speed: number;
        };
        Insert: {
          aspect_ratio?: string;
          bitrate?: string;
          caption_scale?: number;
          caption_style?: string;
          captions?: boolean;
          created_at?: string;
          direct_download_url?: string | null;
          duration_seconds?: number;
          error?: string | null;
          file_id?: string | null;
          id?: string;
          image_style?: string;
          logs?: Json;
          motion_template?: string;
          negative_prompt?: string;
          progress?: number;
          prompt?: string;
          quality?: string;
          status?: string;
          step?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
          video_url?: string | null;
          voice_gender?: string;
          voice_persona?: string;
          voice_pitch?: number;
          voice_speed?: number;
        };
        Update: {
          aspect_ratio?: string;
          bitrate?: string;
          caption_scale?: number;
          caption_style?: string;
          captions?: boolean;
          created_at?: string;
          direct_download_url?: string | null;
          duration_seconds?: number;
          error?: string | null;
          file_id?: string | null;
          id?: string;
          image_style?: string;
          logs?: Json;
          motion_template?: string;
          negative_prompt?: string;
          progress?: number;
          prompt?: string;
          quality?: string;
          status?: string;
          step?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
          video_url?: string | null;
          voice_gender?: string;
          voice_persona?: string;
          voice_pitch?: number;
          voice_speed?: number;
        };
        Relationships: [];
      };
      virtual_models: {
        Row: {
          created_at: string;
          description: string;
          error: string | null;
          headshot_path: string | null;
          id: string;
          identity_prompt: string;
          images: Json;
          job_id: string | null;
          name: string;
          seed: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          error?: string | null;
          headshot_path?: string | null;
          id?: string;
          identity_prompt?: string;
          images?: Json;
          job_id?: string | null;
          name?: string;
          seed?: number;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          error?: string | null;
          headshot_path?: string | null;
          id?: string;
          identity_prompt?: string;
          images?: Json;
          job_id?: string | null;
          name?: string;
          seed?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workflow_runs: {
        Row: {
          created_at: string;
          detail: string | null;
          id: string;
          status: string;
          user_id: string;
          workflow_id: string;
        };
        Insert: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          status?: string;
          user_id: string;
          workflow_id: string;
        };
        Update: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          status?: string;
          user_id?: string;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "workflows";
            referencedColumns: ["id"];
          },
        ];
      };
      workflows: {
        Row: {
          action_type: string;
          caption: string | null;
          created_at: string;
          creation_config: Json;
          enabled: boolean;
          hashtags: string[];
          hook_title: string | null;
          id: string;
          last_run_at: string | null;
          last_run_status: string | null;
          lock_until: string | null;
          media_path: string | null;
          media_url: string | null;
          name: string;
          next_due_at: string | null;
          pending_video_id: string | null;
          publish_at: string | null;
          publish_attempts: number;
          repeat_rule: string;
          run_state: string;
          scheduled_at: string | null;
          targets: string[];
          time_slots: string[];
          trigger_type: string;
          tz_offset: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_type?: string;
          caption?: string | null;
          created_at?: string;
          creation_config?: Json;
          enabled?: boolean;
          hashtags?: string[];
          hook_title?: string | null;
          id?: string;
          last_run_at?: string | null;
          last_run_status?: string | null;
          lock_until?: string | null;
          media_path?: string | null;
          media_url?: string | null;
          name: string;
          next_due_at?: string | null;
          pending_video_id?: string | null;
          publish_at?: string | null;
          publish_attempts?: number;
          repeat_rule?: string;
          run_state?: string;
          scheduled_at?: string | null;
          targets?: string[];
          time_slots?: string[];
          trigger_type?: string;
          tz_offset?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_type?: string;
          caption?: string | null;
          created_at?: string;
          creation_config?: Json;
          enabled?: boolean;
          hashtags?: string[];
          hook_title?: string | null;
          id?: string;
          last_run_at?: string | null;
          last_run_status?: string | null;
          lock_until?: string | null;
          media_path?: string | null;
          media_url?: string | null;
          name?: string;
          next_due_at?: string | null;
          pending_video_id?: string | null;
          publish_at?: string | null;
          publish_attempts?: number;
          repeat_rule?: string;
          run_state?: string;
          scheduled_at?: string | null;
          targets?: string[];
          time_slots?: string[];
          trigger_type?: string;
          tz_offset?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_jobs: {
        Args: { p_lease_seconds: number; p_limit: number };
        Returns: {
          attempts: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          generation_id: string | null;
          id: string;
          input: Json;
          kind: string;
          lease_until: string | null;
          max_attempts: number;
          next_run_at: string;
          result: Json | null;
          state: Json;
          status: string;
          updated_at: string;
          user_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      email_exists: { Args: { check_email: string }; Returns: boolean };
      get_provider_secret: { Args: { p_name: string }; Returns: string };
      pipeline_dispatch: {
        Args: { p_body?: Json; p_path: string };
        Returns: number;
      };
      set_provider_secret: {
        Args: { p_name: string; p_value: string };
        Returns: undefined;
      };
      verify_worker_token: { Args: { p_token: string }; Returns: boolean };
    };
    Enums: {
      plan_tier: "free" | "pro" | "unlimited";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      plan_tier: ["free", "pro", "unlimited"],
    },
  },
} as const;
