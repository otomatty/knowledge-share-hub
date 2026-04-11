import { Badge } from "@/components/ui/badge";

export function AuthVersionBadge() {
  return (
    <Badge
      variant="outline"
      className="fixed left-4 top-4 z-10 border-border/60 bg-background/80 font-mono text-[11px] text-muted-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70"
    >
      v{__APP_VERSION__}
    </Badge>
  );
}
