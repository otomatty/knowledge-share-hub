-- Custom enum types
create type public.content_status as enum ('draft', 'published');
create type public.content_type as enum ('tip', 'memo', 'article');
create type public.reaction_type as enum ('helped', 'clear', 'learned', 'nice');
create type public.user_role as enum ('admin', 'user');

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  current_project text,
  bio text,
  skill_tags text[] default '{}',
  role public.user_role default 'user',
  created_at timestamptz default now()
);

-- Tags
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Tips
create table public.tips (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_anonymous boolean default false,
  status public.content_status default 'draft',
  published_at timestamptz,
  created_at timestamptz default now()
);

create table public.tip_tags (
  tip_id uuid not null references public.tips(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (tip_id, tag_id)
);

-- Articles
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null default '',
  is_anonymous boolean default false,
  status public.content_status default 'draft',
  published_at timestamptz,
  created_at timestamptz default now()
);

create table public.article_tags (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

-- Memos
create table public.memos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  is_anonymous boolean default false,
  status public.content_status default 'draft',
  published_at timestamptz,
  created_at timestamptz default now()
);

create table public.memo_tags (
  memo_id uuid not null references public.memos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (memo_id, tag_id)
);

create table public.memo_entries (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  content text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Books
create table public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  cover_image_url text,
  status public.content_status default 'draft',
  published_at timestamptz,
  created_at timestamptz default now()
);

create table public.book_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  sort_order int not null default 0
);

-- Comments
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  content_type text not null check (content_type in ('memo', 'article')),
  content_id uuid not null,
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz default now()
);

-- Reactions (unique per user+content+type)
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('tip', 'memo', 'article', 'comment')),
  content_id uuid not null,
  reaction_type public.reaction_type not null,
  created_at timestamptz default now(),
  unique (user_id, content_type, content_id, reaction_type)
);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('reaction', 'comment', 'reply')),
  content_type text not null check (content_type in ('tip', 'memo', 'article')),
  content_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  is_read boolean default false,
  message text not null,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index idx_tips_author on public.tips(author_id);
create index idx_tips_status on public.tips(status);
create index idx_articles_author on public.articles(author_id);
create index idx_articles_status on public.articles(status);
create index idx_memos_author on public.memos(author_id);
create index idx_memos_status on public.memos(status);
create index idx_memo_entries_memo on public.memo_entries(memo_id);
create index idx_books_author on public.books(author_id);
create index idx_book_chapters_book on public.book_chapters(book_id);
create index idx_comments_content on public.comments(content_type, content_id);
create index idx_comments_parent on public.comments(parent_id);
create index idx_reactions_content on public.reactions(content_type, content_id);
create index idx_notifications_user on public.notifications(user_id, is_read);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.tips enable row level security;
alter table public.tip_tags enable row level security;
alter table public.articles enable row level security;
alter table public.article_tags enable row level security;
alter table public.memos enable row level security;
alter table public.memo_tags enable row level security;
alter table public.memo_entries enable row level security;
alter table public.books enable row level security;
alter table public.book_chapters enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;

-- RLS Policies: Profiles
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- RLS Policies: Tags (read by everyone, insert by authenticated)
create policy "Tags are viewable by everyone"
  on public.tags for select using (true);

create policy "Authenticated users can create tags"
  on public.tags for insert with check (auth.role() = 'authenticated');

-- RLS Policies: Tips
create policy "Published tips are viewable by everyone"
  on public.tips for select using (status = 'published' or auth.uid() = author_id);

create policy "Users can create own tips"
  on public.tips for insert with check (auth.uid() = author_id);

create policy "Users can update own tips"
  on public.tips for update using (auth.uid() = author_id);

create policy "Users can delete own tips"
  on public.tips for delete using (auth.uid() = author_id);

-- RLS Policies: Tip Tags
create policy "Tip tags are viewable by everyone"
  on public.tip_tags for select using (true);

create policy "Tip authors can manage tip tags"
  on public.tip_tags for insert with check (
    exists (select 1 from public.tips where id = tip_id and author_id = auth.uid())
  );

create policy "Tip authors can delete tip tags"
  on public.tip_tags for delete using (
    exists (select 1 from public.tips where id = tip_id and author_id = auth.uid())
  );

-- RLS Policies: Articles
create policy "Published articles are viewable by everyone"
  on public.articles for select using (status = 'published' or auth.uid() = author_id);

create policy "Users can create own articles"
  on public.articles for insert with check (auth.uid() = author_id);

create policy "Users can update own articles"
  on public.articles for update using (auth.uid() = author_id);

create policy "Users can delete own articles"
  on public.articles for delete using (auth.uid() = author_id);

-- RLS Policies: Article Tags
create policy "Article tags are viewable by everyone"
  on public.article_tags for select using (true);

create policy "Article authors can manage article tags"
  on public.article_tags for insert with check (
    exists (select 1 from public.articles where id = article_id and author_id = auth.uid())
  );

create policy "Article authors can delete article tags"
  on public.article_tags for delete using (
    exists (select 1 from public.articles where id = article_id and author_id = auth.uid())
  );

-- RLS Policies: Memos
create policy "Published memos are viewable by everyone"
  on public.memos for select using (status = 'published' or auth.uid() = author_id);

create policy "Users can create own memos"
  on public.memos for insert with check (auth.uid() = author_id);

create policy "Users can update own memos"
  on public.memos for update using (auth.uid() = author_id);

create policy "Users can delete own memos"
  on public.memos for delete using (auth.uid() = author_id);

-- RLS Policies: Memo Tags
create policy "Memo tags are viewable by everyone"
  on public.memo_tags for select using (true);

create policy "Memo authors can manage memo tags"
  on public.memo_tags for insert with check (
    exists (select 1 from public.memos where id = memo_id and author_id = auth.uid())
  );

create policy "Memo authors can delete memo tags"
  on public.memo_tags for delete using (
    exists (select 1 from public.memos where id = memo_id and author_id = auth.uid())
  );

-- RLS Policies: Memo Entries
create policy "Memo entries are viewable by everyone"
  on public.memo_entries for select using (true);

create policy "Memo authors can manage entries"
  on public.memo_entries for insert with check (
    exists (select 1 from public.memos where id = memo_id and author_id = auth.uid())
  );

create policy "Memo authors can update entries"
  on public.memo_entries for update using (
    exists (select 1 from public.memos where id = memo_id and author_id = auth.uid())
  );

create policy "Memo authors can delete entries"
  on public.memo_entries for delete using (
    exists (select 1 from public.memos where id = memo_id and author_id = auth.uid())
  );

-- RLS Policies: Books
create policy "Published books are viewable by everyone"
  on public.books for select using (status = 'published' or auth.uid() = author_id);

create policy "Users can create own books"
  on public.books for insert with check (auth.uid() = author_id);

create policy "Users can update own books"
  on public.books for update using (auth.uid() = author_id);

create policy "Users can delete own books"
  on public.books for delete using (auth.uid() = author_id);

-- RLS Policies: Book Chapters
create policy "Book chapters are viewable by everyone"
  on public.book_chapters for select using (true);

create policy "Book authors can manage chapters"
  on public.book_chapters for insert with check (
    exists (select 1 from public.books where id = book_id and author_id = auth.uid())
  );

create policy "Book authors can update chapters"
  on public.book_chapters for update using (
    exists (select 1 from public.books where id = book_id and author_id = auth.uid())
  );

create policy "Book authors can delete chapters"
  on public.book_chapters for delete using (
    exists (select 1 from public.books where id = book_id and author_id = auth.uid())
  );

-- RLS Policies: Comments
create policy "Comments are viewable by everyone"
  on public.comments for select using (true);

create policy "Authenticated users can create comments"
  on public.comments for insert with check (auth.uid() = author_id);

create policy "Users can update own comments"
  on public.comments for update using (auth.uid() = author_id);

create policy "Users can delete own comments"
  on public.comments for delete using (auth.uid() = author_id);

-- RLS Policies: Reactions
create policy "Reactions are viewable by everyone"
  on public.reactions for select using (true);

create policy "Authenticated users can create reactions"
  on public.reactions for insert with check (auth.uid() = user_id);

create policy "Users can delete own reactions"
  on public.reactions for delete using (auth.uid() = user_id);

-- RLS Policies: Notifications
create policy "Users can view own notifications"
  on public.notifications for select using (auth.uid() = user_id);

create policy "System can create notifications"
  on public.notifications for insert with check (true);

create policy "Users can update own notifications"
  on public.notifications for update using (auth.uid() = user_id);

-- Auto-create profile on signup via trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
