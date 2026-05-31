/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";
import { Play, Check, Lock } from "lucide-react";
import Link from "next/link";
import { constructUrl } from "@/hooks/use-construct-url";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface iAppProps {
  lesson: {
    id: string;
    title: string;
    position: number;
    description: string | null;
    thumbnailKey?: string | null;
    duration?: number | null;
    isLocked?: boolean;
  };
  slug: string;
  isActive?: boolean;
  completed: boolean;
  courseThumbnail?: string | null;
}

export function LessonItem({
  lesson,
  slug,
  isActive,
  completed,
  courseThumbnail,
}: iAppProps) {
  const router = useRouter();
  const thumbnail = constructUrl(lesson.thumbnailKey || courseThumbnail || "");
  const isLocked = Boolean(lesson.isLocked);

  return (
    <Link
      href={`/dashboard/${slug}/${lesson.id}`}
      onClick={(event) => {
        if (!isLocked) return;
        event.preventDefault();
        toast.info("Request access to unlock this lesson and continue where you left off.", {
          action: { label: "Request", onClick: () => router.push(`/courses/${slug}`) },
          duration: 5000,
        });
      }}
      className={cn(
        "w-full p-2 md:p-1.5 h-auto flex items-center justify-start rounded-xl transition-all border group relative overflow-hidden",

        // Normal
        !isActive &&
          "bg-card/50 hover:bg-accent border-transparent hover:border-border/50",

        // Active
        isActive &&
          "bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20",

        // Completed (subtle indicator)
        completed && !isActive && "opacity-80",
        isLocked && "opacity-55 hover:opacity-80 cursor-not-allowed",
      )}
    >
      {/* Background active indicator */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      )}

      <div className="flex items-center gap-3 w-full min-w-0">
        {/* THUMBNAIL CONTAINER */}
        <div className="relative shrink-0 w-24 md:w-20 aspect-video rounded-lg overflow-hidden border bg-muted">
          <img
            src={thumbnail}
            alt={lesson.title}
            className={cn(
              "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
              isActive ? "opacity-40" : "opacity-90",
              isLocked && "grayscale opacity-45",
            )}
            loading="lazy"
            crossOrigin="anonymous"
          />

          {/* Active Overlay */}
          {isLocked ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/45">
              <div className="p-1.5 rounded-full bg-background/90 border shadow-sm">
                <Lock className="size-3 text-muted-foreground" />
              </div>
            </div>
          ) : isActive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="p-1.5 rounded-full bg-primary/50 backdrop-blur-sm border border-primary/40">
                <Play className="size-2 text-white fill-white" />
              </div>
            </div>
          )}
        </div>

        {/* TEXT CONTENT */}
        <div className="flex flex-col min-w-0 flex-1 py-0.5">
          <h4
            className={cn(
              "text-xs md:text-sm font-semibold truncate leading-snug transition-colors",
              isActive
                ? "text-primary"
                : "text-card-foreground group-hover:text-primary/90",
              (completed && !isActive) || isLocked
                ? "text-muted-foreground"
                : "",
            )}
          >
            {lesson.title}
          </h4>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] md:text-xs text-muted-foreground font-medium flex items-center gap-1">
              Lesson {lesson.position}
            </span>

            {completed && (
              <div className="absolute top-2 right-2 p-0.5 rounded-full bg-green-500 shadow-sm  ">
                <Check className="size-2 text-white" strokeWidth={4} />
              </div>
            )}
            {isLocked ? (
              <span className="text-[10px] font-bold text-muted-foreground uppercase ml-auto pr-1">
                Locked
              </span>
            ) : isActive && (
              <span className="text-[10px] font-bold text-primary uppercase ml-auto pr-1">
                Now Playing
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
