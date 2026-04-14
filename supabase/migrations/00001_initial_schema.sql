create schema if not exists private;
create schema if not exists knowledge_share_hub;

grant usage on schema knowledge_share_hub to anon, authenticated, service_role;

alter default privileges in schema knowledge_share_hub
  grant select on tables to authenticated;
alter default privileges in schema knowledge_share_hub
  grant insert, update, delete on tables to authenticated;
alter default privileges in schema knowledge_share_hub
  grant all on tables to service_role;
alter default privileges in schema knowledge_share_hub
  grant usage, select on sequences to authenticated, service_role;

create type knowledge_share_hub.content_status as enum ('draft', 'published');
create type knowledge_share_hub.content_type as enum ('tip', 'memo', 'article');
create type knowledge_share_hub.reaction_type as enum ('helped', 'clear', 'learned', 'nice');
create type knowledge_share_hub.user_role as enum ('admin', 'user');

create table knowledge_share_hub.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  current_project text,
  bio text,
  skill_tags text[] not null default '{}',
  role knowledge_share_hub.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table knowledge_share_hub.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.tips (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  content text not null,
  is_anonymous boolean not null default false,
  status knowledge_share_hub.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.tip_tags (
  tip_id uuid not null references knowledge_share_hub.tips(id) on delete cascade,
  tag_id uuid not null references knowledge_share_hub.tags(id) on delete cascade,
  primary key (tip_id, tag_id)
);

create table knowledge_share_hub.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  title text not null,
  content text not null default '',
  is_anonymous boolean not null default false,
  status knowledge_share_hub.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.article_tags (
  article_id uuid not null references knowledge_share_hub.articles(id) on delete cascade,
  tag_id uuid not null references knowledge_share_hub.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table knowledge_share_hub.memos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  title text not null,
  is_anonymous boolean not null default false,
  status knowledge_share_hub.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.memo_tags (
  memo_id uuid not null references knowledge_share_hub.memos(id) on delete cascade,
  tag_id uuid not null references knowledge_share_hub.tags(id) on delete cascade,
  primary key (memo_id, tag_id)
);

create table knowledge_share_hub.memo_entries (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references knowledge_share_hub.memos(id) on delete cascade,
  content text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  cover_image_url text,
  status knowledge_share_hub.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.book_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references knowledge_share_hub.books(id) on delete cascade,
  article_id uuid not null references knowledge_share_hub.articles(id) on delete cascade,
  sort_order int not null default 0
);

create table knowledge_share_hub.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  content text not null,
  content_type text not null check (content_type in ('tip', 'memo', 'article')),
  content_id uuid not null,
  parent_id uuid references knowledge_share_hub.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table knowledge_share_hub.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('tip', 'memo', 'article', 'comment')),
  content_id uuid not null,
  reaction_type knowledge_share_hub.reaction_type not null,
  created_at timestamptz not null default now(),
  unique (user_id, content_type, content_id, reaction_type)
);

create table knowledge_share_hub.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  type text not null check (type in ('reaction', 'comment', 'reply')),
  content_type text not null check (content_type in ('tip', 'memo', 'article')),
  content_id uuid not null,
  actor_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  is_read boolean not null default false,
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_ksh_tips_author on knowledge_share_hub.tips(author_id);
create index idx_ksh_tips_status on knowledge_share_hub.tips(status);
create index idx_ksh_articles_author on knowledge_share_hub.articles(author_id);
create index idx_ksh_articles_status on knowledge_share_hub.articles(status);
create index idx_ksh_memos_author on knowledge_share_hub.memos(author_id);
create index idx_ksh_memos_status on knowledge_share_hub.memos(status);
create index idx_ksh_memo_entries_memo on knowledge_share_hub.memo_entries(memo_id);
create index idx_ksh_books_author on knowledge_share_hub.books(author_id);
create index idx_ksh_book_chapters_book on knowledge_share_hub.book_chapters(book_id);
create index idx_ksh_comments_content on knowledge_share_hub.comments(content_type, content_id);
create index idx_ksh_comments_parent on knowledge_share_hub.comments(parent_id);
create index idx_ksh_reactions_content on knowledge_share_hub.reactions(content_type, content_id);
create index idx_ksh_notifications_user on knowledge_share_hub.notifications(user_id, is_read);

alter table knowledge_share_hub.profiles enable row level security;
alter table knowledge_share_hub.tags enable row level security;
alter table knowledge_share_hub.tips enable row level security;
alter table knowledge_share_hub.tip_tags enable row level security;
alter table knowledge_share_hub.articles enable row level security;
alter table knowledge_share_hub.article_tags enable row level security;
alter table knowledge_share_hub.memos enable row level security;
alter table knowledge_share_hub.memo_tags enable row level security;
alter table knowledge_share_hub.memo_entries enable row level security;
alter table knowledge_share_hub.books enable row level security;
alter table knowledge_share_hub.book_chapters enable row level security;
alter table knowledge_share_hub.comments enable row level security;
alter table knowledge_share_hub.reactions enable row level security;
alter table knowledge_share_hub.notifications enable row level security;

create policy "Profiles are viewable by authenticated users"
  on knowledge_share_hub.profiles for select using (auth.role() = 'authenticated');

create policy "Users can update own profile"
  on knowledge_share_hub.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on knowledge_share_hub.profiles for insert with check (auth.uid() = id);

create policy "Tags are viewable by authenticated users"
  on knowledge_share_hub.tags for select using (auth.role() = 'authenticated');

create policy "Authenticated users can create tags"
  on knowledge_share_hub.tags for insert with check (auth.role() = 'authenticated');

create policy "Published tips are viewable by authenticated users"
  on knowledge_share_hub.tips for select using (
    (auth.role() = 'authenticated' and status = 'published')
    or auth.uid() = author_id
  );

create policy "Users can create own tips"
  on knowledge_share_hub.tips for insert with check (auth.uid() = author_id);

create policy "Users can update own tips"
  on knowledge_share_hub.tips for update using (auth.uid() = author_id);

create policy "Users can delete own tips"
  on knowledge_share_hub.tips for delete using (auth.uid() = author_id);

create policy "Tip tags are viewable by authenticated users"
  on knowledge_share_hub.tip_tags for select using (auth.role() = 'authenticated');

create policy "Tip authors can manage tip tags"
  on knowledge_share_hub.tip_tags for insert with check (
    exists (
      select 1
      from knowledge_share_hub.tips
      where id = tip_id and author_id = auth.uid()
    )
  );

create policy "Tip authors can delete tip tags"
  on knowledge_share_hub.tip_tags for delete using (
    exists (
      select 1
      from knowledge_share_hub.tips
      where id = tip_id and author_id = auth.uid()
    )
  );

create policy "Published articles are viewable by authenticated users"
  on knowledge_share_hub.articles for select using (
    (auth.role() = 'authenticated' and status = 'published')
    or auth.uid() = author_id
  );

create policy "Users can create own articles"
  on knowledge_share_hub.articles for insert with check (auth.uid() = author_id);

create policy "Users can update own articles"
  on knowledge_share_hub.articles for update using (auth.uid() = author_id);

create policy "Users can delete own articles"
  on knowledge_share_hub.articles for delete using (auth.uid() = author_id);

create policy "Article tags are viewable by authenticated users"
  on knowledge_share_hub.article_tags for select using (auth.role() = 'authenticated');

create policy "Article authors can manage article tags"
  on knowledge_share_hub.article_tags for insert with check (
    exists (
      select 1
      from knowledge_share_hub.articles
      where id = article_id and author_id = auth.uid()
    )
  );

create policy "Article authors can delete article tags"
  on knowledge_share_hub.article_tags for delete using (
    exists (
      select 1
      from knowledge_share_hub.articles
      where id = article_id and author_id = auth.uid()
    )
  );

create policy "Published memos are viewable by authenticated users"
  on knowledge_share_hub.memos for select using (
    (auth.role() = 'authenticated' and status = 'published')
    or auth.uid() = author_id
  );

create policy "Users can create own memos"
  on knowledge_share_hub.memos for insert with check (auth.uid() = author_id);

create policy "Users can update own memos"
  on knowledge_share_hub.memos for update using (auth.uid() = author_id);

create policy "Users can delete own memos"
  on knowledge_share_hub.memos for delete using (auth.uid() = author_id);

create policy "Memo tags are viewable by authenticated users"
  on knowledge_share_hub.memo_tags for select using (auth.role() = 'authenticated');

create policy "Memo authors can manage memo tags"
  on knowledge_share_hub.memo_tags for insert with check (
    exists (
      select 1
      from knowledge_share_hub.memos
      where id = memo_id and author_id = auth.uid()
    )
  );

create policy "Memo authors can delete memo tags"
  on knowledge_share_hub.memo_tags for delete using (
    exists (
      select 1
      from knowledge_share_hub.memos
      where id = memo_id and author_id = auth.uid()
    )
  );

create policy "Memo entries are viewable by authenticated users"
  on knowledge_share_hub.memo_entries for select using (auth.role() = 'authenticated');

create policy "Memo authors can manage entries"
  on knowledge_share_hub.memo_entries for insert with check (
    exists (
      select 1
      from knowledge_share_hub.memos
      where id = memo_id and author_id = auth.uid()
    )
  );

create policy "Memo authors can update entries"
  on knowledge_share_hub.memo_entries for update using (
    exists (
      select 1
      from knowledge_share_hub.memos
      where id = memo_id and author_id = auth.uid()
    )
  );

create policy "Memo authors can delete entries"
  on knowledge_share_hub.memo_entries for delete using (
    exists (
      select 1
      from knowledge_share_hub.memos
      where id = memo_id and author_id = auth.uid()
    )
  );

create policy "Published books are viewable by authenticated users"
  on knowledge_share_hub.books for select using (
    (auth.role() = 'authenticated' and status = 'published')
    or auth.uid() = author_id
  );

create policy "Users can create own books"
  on knowledge_share_hub.books for insert with check (auth.uid() = author_id);

create policy "Users can update own books"
  on knowledge_share_hub.books for update using (auth.uid() = author_id);

create policy "Users can delete own books"
  on knowledge_share_hub.books for delete using (auth.uid() = author_id);

create policy "Book chapters are viewable by authenticated users"
  on knowledge_share_hub.book_chapters for select using (auth.role() = 'authenticated');

create policy "Book authors can manage chapters"
  on knowledge_share_hub.book_chapters for insert with check (
    exists (
      select 1
      from knowledge_share_hub.books
      where id = book_id and author_id = auth.uid()
    )
  );

create policy "Book authors can update chapters"
  on knowledge_share_hub.book_chapters for update using (
    exists (
      select 1
      from knowledge_share_hub.books
      where id = book_id and author_id = auth.uid()
    )
  );

create policy "Book authors can delete chapters"
  on knowledge_share_hub.book_chapters for delete using (
    exists (
      select 1
      from knowledge_share_hub.books
      where id = book_id and author_id = auth.uid()
    )
  );

create policy "Comments are viewable by authenticated users"
  on knowledge_share_hub.comments for select using (auth.role() = 'authenticated');

create policy "Authenticated users can create comments"
  on knowledge_share_hub.comments for insert with check (auth.uid() = author_id);

create policy "Users can update own comments"
  on knowledge_share_hub.comments for update using (auth.uid() = author_id);

create policy "Users can delete own comments"
  on knowledge_share_hub.comments for delete using (auth.uid() = author_id);

create policy "Reactions are viewable by authenticated users"
  on knowledge_share_hub.reactions for select using (auth.role() = 'authenticated');

create policy "Authenticated users can create reactions"
  on knowledge_share_hub.reactions for insert with check (auth.uid() = user_id);

create policy "Users can delete own reactions"
  on knowledge_share_hub.reactions for delete using (auth.uid() = user_id);

create policy "Users can view own notifications"
  on knowledge_share_hub.notifications for select using (auth.uid() = user_id);

create policy "System can create notifications"
  on knowledge_share_hub.notifications for insert with check (true);

create policy "Users can update own notifications"
  on knowledge_share_hub.notifications for update using (auth.uid() = user_id);

create or replace function knowledge_share_hub.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_knowledge_share_hub_profiles_updated_at
  before update on knowledge_share_hub.profiles
  for each row execute function knowledge_share_hub.update_updated_at();

create or replace function private.handle_new_knowledge_share_hub_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into knowledge_share_hub.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_knowledge_share_hub
  after insert on auth.users
  for each row execute function private.handle_new_knowledge_share_hub_user();

insert into knowledge_share_hub.profiles (id, email, username, display_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'username', split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;
