import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { Tag } from "@/types";

interface TagBadgeLinkProps {
  tag: Tag;
}

export function TagBadgeLink({ tag }: TagBadgeLinkProps) {
  const isContext = tag.category === "context";
  return (
    <Link to={`/search?tag=${encodeURIComponent(tag.name)}`}>
      <Badge
        variant={isContext ? "outline" : "secondary"}
        className={
          isContext
            ? "text-xs border-kh-purple/40 text-kh-purple hover:bg-kh-purple/10"
            : "text-xs hover:bg-primary/10"
        }
      >
        {tag.name}
      </Badge>
    </Link>
  );
}
