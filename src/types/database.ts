/**
 * Supabase Database type definitions.
 * Matches the Postgres schema created in Supabase.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string;
          avatar_url: string | null;
          gender: string | null;
          age_range: string | null;
          goals: string[];
          interests: string[];
          subscription_tier: 'free' | 'plus' | 'pro';
          is_pro: boolean;
          favorite_peptides: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      check_ins: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          mood: number;
          energy: number;
          stress: number;
          sleep_quality: number;
          recovery: number;
          appetite: number;
          weight_lbs: number | null;
          resting_heart_rate: number | null;
          steps: number | null;
          hrv_ms: number | null;
          vo2_max: number | null;
          spo2: number | null;
          notes: string | null;
          emotion_tags: string[];
          side_effect_tags: string[];
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['check_ins']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['check_ins']['Insert']>;
      };
      dose_logs: {
        Row: {
          id: string;
          user_id: string;
          peptide_id: string;
          peptide_name: string;
          dose_mcg: number;
          route: string;
          date: string;
          time: string;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['dose_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['dose_logs']['Insert']>;
      };
      meal_entries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          meal_type: string;
          foods: Record<string, unknown>[];
          quick_log: Record<string, unknown> | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['meal_entries']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['meal_entries']['Insert']>;
      };
      workout_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          program_id: string | null;
          workout_name: string | null;
          sets: Record<string, unknown>[];
          duration_minutes: number;
          rating: number | null;
          notes: string | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['workout_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['workout_logs']['Insert']>;
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['chat_messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>;
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          title: string;
          content: string;
          tags: string[];
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['journal_entries']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['journal_entries']['Insert']>;
      };
      saved_stacks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          peptides: Record<string, unknown>[];
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['saved_stacks']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['saved_stacks']['Insert']>;
      };
      health_profiles: {
        Row: {
          id: string;
          user_id: string;
          sex: string | null;
          dob: string | null;
          weight_lbs: number | null;
          height_inches: number | null;
          body_fat_percent: number | null;
          goal_weight_lbs: number | null;
          activity_level: string | null;
          diet_type: string | null;
          conditions: string[];
          medications: string[];
          allergies: string[];
          supplements: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['health_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['health_profiles']['Insert']>;
      };
      // Runtime overrides for the workout-video manifest
      // (src/data/workoutVideos.json), keyed by slug. Read by the app and
      // merged over the bundled JSON; written only by the
      // save-workout-overrides edge function (service_role).
      workout_video_overrides: {
        Row: {
          slug: string;
          title: string | null;
          description: string | null;
          exercise_id: string | null;
          category: string | null;
          duration_sec: number | null;
          needs_review: boolean | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['workout_video_overrides']['Row'], 'updated_at'>;
        Update: Partial<Database['public']['Tables']['workout_video_overrides']['Insert']>;
      };
    };
  };
}
