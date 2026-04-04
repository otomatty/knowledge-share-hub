export type ContentType = 'tip' | 'memo' | 'article';
export type ContentStatus = 'draft' | 'published';
export type ReactionType = 'helped' | 'clear' | 'learned' | 'nice';
export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  current_project?: string;
  bio?: string;
  skill_tags: string[];
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Tip {
  id: string;
  author: User;
  content: string;
  is_anonymous: boolean;
  status: ContentStatus;
  tags: Tag[];
  reactions: ReactionSummary;
  published_at?: string;
  created_at: string;
}

export interface Memo {
  id: string;
  author: User;
  title: string;
  is_anonymous: boolean;
  status: ContentStatus;
  tags: Tag[];
  entries: MemoEntry[];
  reactions: ReactionSummary;
  comment_count: number;
  published_at?: string;
  created_at: string;
}

export interface MemoEntry {
  id: string;
  content: string;
  order: number;
  created_at: string;
}

export interface Article {
  id: string;
  author: User;
  title: string;
  content: string;
  is_anonymous: boolean;
  status: ContentStatus;
  tags: Tag[];
  reactions: ReactionSummary;
  comment_count: number;
  published_at?: string;
  created_at: string;
}

export interface Book {
  id: string;
  author: User;
  title: string;
  description: string;
  cover_image_url?: string;
  status: ContentStatus;
  chapters: BookChapter[];
  published_at?: string;
  created_at: string;
}

export interface BookChapter {
  id: string;
  article: Article;
  order: number;
}

export interface Comment {
  id: string;
  author: User;
  content: string;
  content_type: 'memo' | 'article';
  content_id: string;
  parent_id?: string;
  replies?: Comment[];
  reactions: ReactionSummary;
  created_at: string;
}

export interface ReactionSummary {
  helped: number;
  clear: number;
  learned: number;
  nice: number;
}

export interface Notification {
  id: string;
  type: 'reaction' | 'comment' | 'reply';
  content_type: ContentType;
  content_id: string;
  actor: User;
  is_read: boolean;
  created_at: string;
  message: string;
}

export interface FeedItem {
  type: ContentType;
  data: Tip | Memo | Article;
  score?: number;
}

export const REACTION_CONFIG: Record<ReactionType, { emoji: string; label: string }> = {
  helped: { emoji: '🙏', label: '助かった' },
  clear: { emoji: '📖', label: 'わかりやすい' },
  learned: { emoji: '💡', label: '勉強になった' },
  nice: { emoji: '👏', label: 'ナイス' },
};
