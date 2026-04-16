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
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
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
          type: "reaction" | "comment" | "reply";
          content_type: "tip";
          content_id: string;
          actor_id: string;
          is_read: boolean;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "reaction" | "comment" | "reply";
          content_type: "tip";
          content_id: string;
          actor_id: string;
          is_read?: boolean;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "reaction" | "comment" | "reply";
          content_type?: "tip";
          content_id?: string;
          actor_id?: string;
          is_read?: boolean;
          message?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      content_status: "draft" | "published";
      content_type: "tip";
      reaction_type: "same_thought" | "new_view" | "try_it" | "learned";
      user_role: "admin" | "user";
    };
  };
};
