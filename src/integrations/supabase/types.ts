export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          created_at: string;
          avatar_url: string | null;
          department: string | null;
          updated_at: string;
          employee_id: string | null;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          created_at?: string;
          avatar_url?: string | null;
          department?: string | null;
          updated_at?: string;
          employee_id?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          created_at?: string;
          avatar_url?: string | null;
          department?: string | null;
          updated_at?: string;
          employee_id?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
  knowledge_share_hub: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          current_project: string | null;
          bio: string | null;
          skill_tags: string[];
          role: "admin" | "user";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          current_project?: string | null;
          bio?: string | null;
          skill_tags?: string[];
          role?: "admin" | "user";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          current_project?: string | null;
          bio?: string | null;
          skill_tags?: string[];
          role?: "admin" | "user";
          created_at?: string;
          updated_at?: string;
        };
      };
      tags: {
        Row: {
          id: string;
          name: string;
          category: "tech" | "context";
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: "tech" | "context";
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: "tech" | "context";
          created_at?: string;
        };
      };
      tips: {
        Row: {
          id: string;
          author_id: string;
          content: string;
          is_anonymous: boolean;
          status: "draft" | "published";
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          content: string;
          is_anonymous?: boolean;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          content?: string;
          is_anonymous?: boolean;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
      };
      tip_tags: {
        Row: {
          tip_id: string;
          tag_id: string;
        };
        Insert: {
          tip_id: string;
          tag_id: string;
        };
        Update: {
          tip_id?: string;
          tag_id?: string;
        };
      };
      comments: {
        Row: {
          id: string;
          author_id: string;
          content: string;
          content_type: "tip";
          content_id: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          content: string;
          content_type: "tip";
          content_id: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          content?: string;
          content_type?: "tip";
          content_id?: string;
          parent_id?: string | null;
          created_at?: string;
        };
      };
      reactions: {
        Row: {
          id: string;
          user_id: string;
          content_type: "tip" | "comment";
          content_id: string;
          reaction_type: "same_thought" | "new_view" | "try_it" | "learned";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_type: "tip" | "comment";
          content_id: string;
          reaction_type: "same_thought" | "new_view" | "try_it" | "learned";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content_type?: "tip" | "comment";
          content_id?: string;
          reaction_type?: "same_thought" | "new_view" | "try_it" | "learned";
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type:
            | "reaction"
            | "comment"
            | "reply"
            | "try_it_followup"
            | "try_it_result"
            | "resurface_self";
          content_type: "tip";
          content_id: string;
          // Nullable since migration 00020: anonymous try_it_result
          // notifications store NULL here to preserve anonymity.
          actor_id: string | null;
          is_read: boolean;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type:
            | "reaction"
            | "comment"
            | "reply"
            | "try_it_followup"
            | "try_it_result"
            | "resurface_self";
          content_type: "tip";
          content_id: string;
          actor_id?: string | null;
          is_read?: boolean;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?:
            | "reaction"
            | "comment"
            | "reply"
            | "try_it_followup"
            | "try_it_result"
            | "resurface_self";
          content_type?: "tip";
          content_id?: string;
          actor_id?: string | null;
          is_read?: boolean;
          message?: string;
          created_at?: string;
        };
      };
      tip_attempts: {
        Row: {
          id: string;
          source_tip_id: string;
          result_tip_id: string | null;
          user_id: string;
          pledged_at: string;
          completed_at: string | null;
          follow_up_notified_at: string | null;
        };
        Insert: {
          id?: string;
          source_tip_id: string;
          result_tip_id?: string | null;
          user_id: string;
          pledged_at?: string;
          completed_at?: string | null;
          follow_up_notified_at?: string | null;
        };
        Update: {
          id?: string;
          source_tip_id?: string;
          result_tip_id?: string | null;
          user_id?: string;
          pledged_at?: string;
          completed_at?: string | null;
          follow_up_notified_at?: string | null;
        };
      };
      tip_resurfacings: {
        Row: {
          id: string;
          user_id: string;
          tip_id: string;
          interval_days: number;
          surfaced_at: string;
          acknowledged_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          tip_id: string;
          interval_days: number;
          surfaced_at?: string;
          acknowledged_at?: string | null;
        };
        Update: {
          // Only `acknowledged_at` is user-mutable — a BEFORE trigger
          // (00022) rejects any other column change.
          id?: string;
          user_id?: string;
          tip_id?: string;
          interval_days?: number;
          surfaced_at?: string;
          acknowledged_at?: string | null;
        };
      };
      tip_addendums: {
        Row: {
          id: string;
          tip_id: string;
          author_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tip_id: string;
          author_id: string;
          content: string;
          created_at?: string;
        };
        // Addendums are append-only (no UPDATE/DELETE policy on the
        // table), but PostgREST still requires an Update shape for
        // `.from(...)` to type-check — keep it permissive to mirror
        // the other tables rather than introducing a new narrow type.
        Update: {
          id?: string;
          tip_id?: string;
          author_id?: string;
          content?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      // Read-only view exposing tip_attempts with `user_id` masked to
      // NULL when the viewer isn't the owner and the linked result tip
      // is anonymous (migration 00019). SELECT on the underlying
      // `tip_attempts` table is revoked from authenticated/anon, so
      // this is the sole read path for clients.
      tip_attempts_public: {
        Row: {
          id: string;
          source_tip_id: string;
          result_tip_id: string | null;
          user_id: string | null;
          pledged_at: string;
          completed_at: string | null;
          follow_up_notified_at: string | null;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: {
      content_status: "draft" | "published";
      content_type: "tip";
      reaction_type: "same_thought" | "new_view" | "try_it" | "learned";
      user_role: "admin" | "user";
    };
  };
};
