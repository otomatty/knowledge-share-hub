import { describe, it, expect } from "vitest";
import {
  mapTipRow,
  mapCommentRow,
  type TipWithJoins,
  type CommentWithAuthor,
} from "./supabase-mappers";
import type { Database } from "@/integrations/supabase/types";
import type { ReactionSummary } from "@/types";

type ProfileRow = Database["knowledge_share_hub"]["Tables"]["profiles"]["Row"];
type TagRow = Database["knowledge_share_hub"]["Tables"]["tags"]["Row"];

function mkProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    email: "tanaka@example.com",
    username: "tanaka",
    display_name: "田中",
    avatar_url: null,
    current_project: null,
    bio: null,
    skill_tags: [],
    role: "user",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function mkTagRow(id: string, category: TagRow["category"]): TagRow {
  return {
    id,
    name: id,
    category,
    created_at: "2026-05-01T00:00:00.000Z",
  };
}

function mkReactions(overrides: Partial<ReactionSummary> = {}): ReactionSummary {
  return {
    same_thought: 0,
    new_view: 0,
    try_it: 0,
    learned: 0,
    ...overrides,
  };
}

function mkTipRow(overrides: Partial<TipWithJoins> = {}): TipWithJoins {
  const row: TipWithJoins = {
    id: "tip-1",
    author_id: "user-1",
    content: "気づき本文",
    is_anonymous: false,
    status: "published",
    published_at: "2026-05-01T00:00:00.000Z",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    author: mkProfile(),
    tip_tags: null,
    ...overrides,
  } as TipWithJoins;
  return row;
}

describe("mapTipRow", () => {
  it("translates a published tip with reactions and a comment count", () => {
    const reactions = mkReactions({ same_thought: 3, learned: 1 });
    const tip = mapTipRow(mkTipRow(), reactions, 7);
    expect(tip).toMatchObject({
      id: "tip-1",
      content: "気づき本文",
      is_anonymous: false,
      status: "published",
      reactions,
      comment_count: 7,
      published_at: "2026-05-01T00:00:00.000Z",
      created_at: "2026-05-01T00:00:00.000Z",
    });
    expect(tip.author.id).toBe("user-1");
    expect(tip.author.username).toBe("tanaka");
  });

  it("defaults comment count to 0 when omitted", () => {
    const tip = mapTipRow(mkTipRow(), mkReactions());
    expect(tip.comment_count).toBe(0);
  });

  it("normalises null published_at to undefined (e.g. drafts)", () => {
    const tip = mapTipRow(
      mkTipRow({ status: "draft", published_at: null }),
      mkReactions(),
    );
    expect(tip.status).toBe("draft");
    expect(tip.published_at).toBeUndefined();
  });

  it("preserves the is_anonymous flag", () => {
    const tip = mapTipRow(
      mkTipRow({ is_anonymous: true }),
      mkReactions(),
    );
    expect(tip.is_anonymous).toBe(true);
  });

  it("flattens tip_tags joins into Tag[]", () => {
    const tip = mapTipRow(
      mkTipRow({
        tip_tags: [
          { tag: mkTagRow("react", "tech") },
          { tag: mkTagRow("ハマった", "context") },
        ],
      }),
      mkReactions(),
    );
    expect(tip.tags).toEqual([
      { id: "react", name: "react", category: "tech" },
      { id: "ハマった", name: "ハマった", category: "context" },
    ]);
  });

  it("returns [] tags when tip_tags is null or undefined", () => {
    expect(mapTipRow(mkTipRow({ tip_tags: null }), mkReactions()).tags).toEqual(
      [],
    );
    expect(
      mapTipRow(
        mkTipRow({ tip_tags: undefined as unknown as null }),
        mkReactions(),
      ).tags,
    ).toEqual([]);
  });
});

describe("mapCommentRow", () => {
  function mkCommentRow(
    overrides: Partial<CommentWithAuthor> = {},
  ): CommentWithAuthor {
    return {
      id: "comment-1",
      content_type: "tip",
      content_id: "tip-1",
      author_id: "user-1",
      content: "コメント本文",
      parent_id: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
      author: mkProfile(),
      ...overrides,
    } as CommentWithAuthor;
  }

  it("maps a top-level comment with replies", () => {
    const replies = [
      {
        id: "comment-2",
        author: { id: "user-2" } as never,
        content: "返信",
        content_type: "tip" as const,
        content_id: "tip-1",
        parent_id: "comment-1",
        replies: undefined,
        reactions: mkReactions(),
        created_at: "2026-05-01T01:00:00.000Z",
      },
    ];
    const reactions = mkReactions({ new_view: 2 });
    const comment = mapCommentRow(mkCommentRow(), reactions, replies);
    expect(comment).toMatchObject({
      id: "comment-1",
      content: "コメント本文",
      content_type: "tip",
      content_id: "tip-1",
      reactions,
      replies,
    });
    expect(comment.parent_id).toBeUndefined();
  });

  it("collapses null parent_id into undefined", () => {
    const comment = mapCommentRow(
      mkCommentRow({ parent_id: null }),
      mkReactions(),
      undefined,
    );
    expect(comment.parent_id).toBeUndefined();
  });

  it("preserves a non-null parent_id (reply)", () => {
    const comment = mapCommentRow(
      mkCommentRow({ id: "comment-2", parent_id: "comment-1" }),
      mkReactions(),
      undefined,
    );
    expect(comment.parent_id).toBe("comment-1");
  });

  it("hard-codes content_type to 'tip' regardless of the row's value", () => {
    // Feed a non-"tip" value (cast through unknown because the column
    // type is the literal "tip"). The mapper hard-codes the output to
    // "tip"; the test would have silently passed if we'd left the input
    // at "tip" since identity == hard-code.
    const comment = mapCommentRow(
      mkCommentRow({ content_type: "post" as unknown as "tip" }),
      mkReactions(),
      undefined,
    );
    expect(comment.content_type).toBe("tip");
  });
});
