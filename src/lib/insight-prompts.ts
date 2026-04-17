export const INSIGHT_PROMPTS: readonly string[] = [
  "今日、何に気づいた？",
  "直近で「あ、これ便利」と思ったことは？",
  "今週、自分の考え方が変わった瞬間は？",
  "同僚に伝えたい \"ちょっとしたこと\" は？",
  "最近の \"違和感\" は何だった？",
  "今日ハマった落とし穴は？",
  "最近読んだ中で一番響いた一文は？",
  "もっと早く知りたかった…と思ったことは？",
  "今日、コードや仕事でどんな小さな工夫をした？",
  "直近で自分なりに言語化できた気づきは？",
  "当たり前だと思っていたけど、実は違った？ということは？",
  "今週、過去の自分に教えてあげたいことは？",
  "最近、何に時間を溶かした？ そこから学んだことは？",
  "昨日より1mmだけ成長した実感があったのは、どんな瞬間？",
  "最近、誰かに感謝した瞬間は？ そこから何を学んだ？",
] as const;

export function getDailyPrompt(date: Date = new Date()): string {
  // Absolute day number (local date), so consecutive calendar days always
  // rotate by one step — avoids collisions at month boundaries that a plain
  // `getDate() % length` would produce (e.g. Jan 31 and Feb 1 mapping to the
  // same prompt).
  const localMidnightMs = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const dayIndex = Math.floor(localMidnightMs / 86_400_000);
  return INSIGHT_PROMPTS[
    ((dayIndex % INSIGHT_PROMPTS.length) + INSIGHT_PROMPTS.length) %
      INSIGHT_PROMPTS.length
  ];
}
