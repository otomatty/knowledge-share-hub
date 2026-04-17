import { useEffect, useState } from "react";
import { getDailyPrompt } from "@/lib/insight-prompts";

// Returns the rotating "今日のお題" and keeps it fresh when the user leaves a
// tab open across midnight. Polls once a minute and only re-renders when the
// prompt actually flips.
export function useDailyPrompt(): string {
  const [prompt, setPrompt] = useState(() => getDailyPrompt());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setPrompt((prev) => {
        const next = getDailyPrompt();
        return prev === next ? prev : next;
      });
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, []);

  return prompt;
}
