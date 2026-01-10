"use client"
import { useRef } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { UsersIcon } from "@/components/ui/users";
import { BookTextIcon } from "@/components/ui/book-text";
import { PlayIcon } from "@/components/ui/play";
import { FileTextIcon } from "@/components/ui/file-text";
import { UserIcon } from "@/components/ui/user";
import { CircleCheckIcon } from "@/components/ui/circle-check";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { BookOpen, CheckCircle, GraduationCap } from "lucide-react";

const ICON_MAP = {
  users: UsersIcon,
  "book-text": BookTextIcon,
  play: PlayIcon,
  "file-text": FileTextIcon,
  user: UserIcon,
  "circle-check": CircleCheckIcon,
  "clipboard-check": ClipboardCheckIcon,
  "book-open": BookOpen,
  "check-circle": CheckCircle,
  "graduation-cap": GraduationCap,
} as const;

export type IconName = keyof typeof ICON_MAP;

interface AnalyticsCardProps {
  title: string;
  value: string | number;
  icon: IconName | React.ForwardRefExoticComponent<any> | React.ComponentType<any>;
  description?: string;
}

export function AnalyticsCard({
  title,
  value,
  icon,
  description,
}: AnalyticsCardProps) {
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null);

  // Determine which component to render
  const IconComponent = typeof icon === "string" ? ICON_MAP[icon] : icon;
  
  const handleMouseEnter = () => {
    if (iconRef.current && 'startAnimation' in iconRef.current) {
        iconRef.current.startAnimation();
    }
  };

  const handleMouseLeave = () => {
    if (iconRef.current && 'stopAnimation' in iconRef.current) {
        iconRef.current.stopAnimation();
    }
  };

  return (
    <Card
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group rounded-xl border bg-card transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-default"
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardDescription className="text-sm font-medium">
            {title}
          </CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums mt-1">
            {value}
          </CardTitle>
        </div>

        {/* Animated Icon Container */}
        <div className="p-2 rounded-md bg-primary/10 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-primary/20">
          {IconComponent && (
            <IconComponent 
              ref={iconRef} 
              className="size-6 text-primary" 
              size={24} 
            />
          )}
        </div>
      </CardHeader>

      {description && (
        <CardFooter className="pb-4">
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardFooter>
      )}
    </Card>
  );
}
