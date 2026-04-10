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
      articles: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          content: string;
          is_anonymous: boolean;
          status: "draft" | "published";
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          content: string;
          is_anonymous?: boolean;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          title?: string;
          content?: string;
          is_anonymous?: boolean;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
      };
      article_tags: {
        Row: {
          article_id: string;
          tag_id: string;
        };
        Insert: {
          article_id: string;
          tag_id: string;
        };
        Update: {
          article_id?: string;
          tag_id?: string;
        };
      };
      memos: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          is_anonymous: boolean;
          status: "draft" | "published";
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          is_anonymous?: boolean;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          title?: string;
          is_anonymous?: boolean;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
      };
      memo_tags: {
        Row: {
          memo_id: string;
          tag_id: string;
        };
        Insert: {
          memo_id: string;
          tag_id: string;
        };
        Update: {
          memo_id?: string;
          tag_id?: string;
        };
      };
      memo_entries: {
        Row: {
          id: string;
          memo_id: string;
          content: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          memo_id: string;
          content: string;
          sort_order: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          memo_id?: string;
          content?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
      books: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          description: string;
          cover_image_url: string | null;
          status: "draft" | "published";
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          description: string;
          cover_image_url?: string | null;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          title?: string;
          description?: string;
          cover_image_url?: string | null;
          status?: "draft" | "published";
          published_at?: string | null;
          created_at?: string;
        };
      };
      book_chapters: {
        Row: {
          id: string;
          book_id: string;
          article_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          book_id: string;
          article_id: string;
          sort_order: number;
        };
        Update: {
          id?: string;
          book_id?: string;
          article_id?: string;
          sort_order?: number;
        };
      };
      comments: {
        Row: {
          id: string;
          author_id: string;
          content: string;
          content_type: "memo" | "article";
          content_id: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          content: string;
          content_type: "memo" | "article";
          content_id: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          content?: string;
          content_type?: "memo" | "article";
          content_id?: string;
          parent_id?: string | null;
          created_at?: string;
        };
      };
      reactions: {
        Row: {
          id: string;
          user_id: string;
          content_type: "tip" | "memo" | "article" | "comment";
          content_id: string;
          reaction_type: "helped" | "clear" | "learned" | "nice";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_type: "tip" | "memo" | "article" | "comment";
          content_id: string;
          reaction_type: "helped" | "clear" | "learned" | "nice";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content_type?: "tip" | "memo" | "article" | "comment";
          content_id?: string;
          reaction_type?: "helped" | "clear" | "learned" | "nice";
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: "reaction" | "comment" | "reply";
          content_type: "tip" | "memo" | "article";
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
          content_type: "tip" | "memo" | "article";
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
          content_type?: "tip" | "memo" | "article";
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
      content_type: "tip" | "memo" | "article";
      reaction_type: "helped" | "clear" | "learned" | "nice";
      user_role: "admin" | "user";
    };
  };
};
