export type ContentType = 'tip';
export type ContentStatus = 'draft' | 'published';
export type ReactionType = 'same_thought' | 'new_view' | 'try_it' | 'learned';
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

export type TagCategory = 'tech' | 'context';

export interface Tag {
  id: string;
  name: string;
  category: TagCategory;
}

export const CONTEXT_TAG_PRESETS = [
  '#今日の学び',
  '#ハマった',
  '#逆に気づいた',
  '#違和感',
  '#試してみたい',
  '#振り返り',
] as const;

export interface Tip {
  id: string;
  author: User;
  content: string;
  is_anonymous: boolean;
  status: ContentStatus;
  tags: Tag[];
  reactions: ReactionSummary;
  comment_count?: number;
  published_at?: string;
  created_at: string;
}

export interface Comment {
  id: string;
  author: User;
  content: string;
  content_type: 'tip';
  content_id: string;
  parent_id?: string;
  replies?: Comment[];
  reactions: ReactionSummary;
  created_at: string;
}

export interface ReactionSummary {
  same_thought: number;
  new_view: number;
  try_it: number;
  learned: number;
}

export type NotificationType =
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'try_it_followup'
  | 'try_it_result';

export interface Notification {
  id: string;
  type: NotificationType;
  content_type: ContentType;
  content_id: string;
  // Null when the source action was anonymous (e.g., try_it_result
  // for a result tip posted with is_anonymous=true) — migration 00020
  // made `notifications.actor_id` nullable so the source author can't
  // deanonymise the actor by joining on profiles.
  actor: User | null;
  is_read: boolean;
  created_at: string;
  message: string;
}

// Pledge record: "user X said they'd try tip Y; eventually posted result tip Z"
export interface TipAttempt {
  id: string;
  source_tip_id: string;
  result_tip_id: string | null;
  user_id: string;
  pledged_at: string;
  completed_at: string | null;
  follow_up_notified_at: string | null;
}

export const REACTION_CONFIG: Record<ReactionType, { emoji: string; label: string }> = {
  same_thought: { emoji: '🤔', label: '自分も思った' },
  new_view: { emoji: '💡', label: '新しい視点だった' },
  try_it: { emoji: '🔁', label: '試してみる' },
  learned: { emoji: '📘', label: '学びになった' },
};
