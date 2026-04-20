-- Issue #12 (phase 1): タグフォロー.
--
-- Twitter centres discovery on *who you follow*; this app deliberately
-- centres it on *what kind of 気づき* you care about. To make that real
-- we add the ability to follow tags — both tech and context
-- (`tags.category`, migration 00007) — without introducing a
-- follow-user concept.
--
-- Privacy: the issue calls out that follower counts are *not* displayed
-- ("フォロワー数は表示しない"). The simplest way to honour that by
-- construction is to make the follow relation *private to the follower*.
-- The SELECT policy only matches the follower's own rows, so there is no
-- API surface through which anyone can aggregate or enumerate another
-- user's follows — the DB itself refuses to return them.

create table knowledge_share_hub.tag_follows (
  user_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  tag_id uuid not null references knowledge_share_hub.tags(id) on delete cascade,
  followed_at timestamptz not null default now(),
  -- Composite PK doubles as the (user_id, tag_id) uniqueness guarantee
  -- and the primary lookup index for "does user U follow tag T?" and
  -- "all tags U follows" (user_id is the PK's leading column).
  primary key (user_id, tag_id)
);

-- Reverse direction: "how many people follow tag T?" — not shown to
-- users (see privacy note above) but useful internally for future
-- server-side aggregates / admin tools without forcing a seq scan.
create index idx_ksh_tag_follows_tag
  on knowledge_share_hub.tag_follows(tag_id);

alter table knowledge_share_hub.tag_follows enable row level security;

-- Viewing: a follow row is visible only to its own follower. This is
-- what keeps follower counts uncomputable by clients — there is no
-- policy that would return another user's follow rows, so `count(*)`
-- from anywhere other than the owner returns 0.
create policy "Users can view own tag follows"
  on knowledge_share_hub.tag_follows for select
  using (auth.uid() = user_id);

-- Inserting: a user can only follow on their own behalf.
create policy "Users can insert own tag follows"
  on knowledge_share_hub.tag_follows for insert
  with check (auth.uid() = user_id);

-- Deleting: a user can only unfollow their own follows.
create policy "Users can delete own tag follows"
  on knowledge_share_hub.tag_follows for delete
  using (auth.uid() = user_id);

-- No UPDATE policy — the row carries no user-mutable state. Toggling
-- the follow relation is a delete + re-insert, which also resets
-- followed_at to "now" (desired: a re-follow should feel fresh).
