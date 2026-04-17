import { Badge } from "@/components/ui/badge";
import { useTags } from "@/hooks/use-supabase-query";
import type { Tag } from "@/types";

interface ContextTagPickerProps {
  value: Tag | null;
  onChange: (tag: Tag | null) => void;
}

export function ContextTagPicker({ value, onChange }: ContextTagPickerProps) {
  const { data: dbTags = [] } = useTags();
  const contextTags = dbTags.filter((t) => t.category === "context");

  return (
    <div className="flex flex-wrap gap-1.5">
      {contextTags.map((tag) => {
        const isSelected = value?.id === tag.id;
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() =>
              onChange(isSelected ? null : { ...tag, category: "context" })
            }
            className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
          >
            <Badge
              variant={isSelected ? "default" : "outline"}
              className={
                isSelected
                  ? "bg-kh-purple text-white hover:bg-kh-purple/80 cursor-pointer"
                  : "border-kh-purple/40 text-kh-purple hover:bg-kh-purple/10 cursor-pointer"
              }
            >
              {tag.name}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
