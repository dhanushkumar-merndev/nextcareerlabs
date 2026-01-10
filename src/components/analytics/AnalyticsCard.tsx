"use client"
import { useRef } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";

interface AnalyticsCardProps {
  title: string;
  value: string | number;
  icon: React.ForwardRefExoticComponent<any>;
  description?: string;
}

export function AnalyticsCard({
  title,
  value,
  icon: Icon,
  description,
}: AnalyticsCardProps) {
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null);

  return (
    <Card
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className="
        group rounded-xl border bg-card
        transition-all duration-300
        hover:shadow-lg hover:-translate-y-1
        cursor-default
      "
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
        <div
          className="
            p-2 rounded-md bg-primary/10 
            transition-all duration-300
            group-hover:scale-110 group-hover:rotate-6 
            group-hover:bg-primary/20
          "
        >
          <Icon ref={iconRef} className="size-6 text-primary" size={24} />
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
