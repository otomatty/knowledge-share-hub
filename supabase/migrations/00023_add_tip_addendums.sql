-- Issue #10 follow-up (PR #27 review). The first pass stored the "再読み
-- 追記" inline by concatenating it into `tips.content`, which two
-- unrelated reviewers flagged:
--
--  1. **P1 data-integrity bug**: `tips.content` carries a CHECK
--     constraint `char_length(content) <= 140` (migration 00004). An
--     append like `…\n\n---\n**[YYYY-MM-DD 再読み追記]** <text>` adds
--     ~30 characters of framing before any user prose, so a tip near
--     the 140-char limit (the common case) would push past the
--     constraint and the UPDATE would be rejected by Postgres —
--     breaking the main "追記する" flow for the most likely inputs.
--
--  2. **Read-modify-write race**: the mutation concatenated `addendum`
--     onto a `currentContent` snapshot captured at fetch time. A
--     concurrent edit from another tab between the fetch and the
--     write would be silently overwritten.
--
-- Both go away by storing each addendum as its own row in a dedicated
-- `tip_addendums` table: the original tip stays within its 140-char
-- budget, addendums accumulate cleanly over time, the write is a
-- simple INSERT (no read-before-write), and future resurfacing
-- intervals (30-day, 90-day, …) can reuse the same shape without
-- changing the tip body.

-- 1. tip_addendums
create table knowledge_share_hub.tip_addendums (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid not null references knowledge_share_hub.tips(id) on delete cascade,
  author_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  -- Same 140-char ceiling as `tips.content`; keeps every addendum
  -- inside the "short-form" product shape rather than letting the
  -- append path become a backdoor for long-form posts.
  constraint tip_addendums_content_length_check
    check (char_length(content) <= 140 and char_length(content) > 0)
);

create index idx_ksh_tip_addendums_tip_created
  on knowledge_share_hub.tip_addendums(tip_id, created_at);
create index idx_ksh_tip_addendums_author
  on knowledge_share_hub.tip_addendums(author_id);

alter table knowledge_share_hub.tip_addendums enable row level security;

-- Viewing: same visibility rule as `tips` — any authenticated user can
-- read. Anonymity of the parent tip is handled at the render layer via
-- `tips.is_anonymous`; the addendum author is always the tip author so
-- there's no separate anonymity vector to protect here.
create policy "Tip addendums viewable by authenticated users"
  on knowledge_share_hub.tip_addendums for select
  using (auth.role() = 'authenticated');

-- Inserting: only the tip's own author can add an addendum. The
-- subquery pins `author_id` against `tips.author_id`, which makes it
-- impossible to append to someone else's tip even if the client
-- passes a matching `author_id = auth.uid()`.
create policy "Only tip author can append addendums"
  on knowledge_share_hub.tip_addendums for insert
  with check (
    auth.uid() = author_id
    and author_id = (
      select author_id
      from knowledge_share_hub.tips
      where id = tip_id
    )
  );

-- No UPDATE / DELETE policy: addendums are append-only by design. If a
-- user wants to remove one they can delete the parent tip (cascades).
