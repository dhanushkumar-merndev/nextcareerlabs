/* This component is used to display a feature card */

"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnimatedIconHandle } from "@/lib/icon-animation";
import type { FeatureCardProps } from "@/lib/types/homePage";

export function FeatureCard({ title, description, Icon }: FeatureCardProps) {
  const iconRef = useRef<AnimatedIconHandle | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Infinite animation on mobile
    useEffect(() => {
      if (!isMobile) return;
      let cancelled = false;
      const icon = iconRef.current;

      const start = async () => {
        while (!cancelled) {
          await icon?.startAnimation();
          await new Promise((r) => setTimeout(r, 1200));
        }
      };
      const timer = setTimeout(start, 100);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        icon?.stopAnimation();
      };
    }, [isMobile]);
  
  return (
    <Card onMouseEnter={ !isMobile ? () => iconRef.current?.startAnimation() : undefined }
      onMouseLeave={ !isMobile ? () => iconRef.current?.stopAnimation() : undefined }
      className={`group rounded-xl border bg-card transition-shadow duration-200 hover:shadow-lg p-4 md:py-9 md:px-9`}>
      <CardHeader className={`flex flex-row items-center gap-4 md:flex-col md:items-start md:gap-3 p-0`}>
        <div className={`size-12 md:size-14 flex items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-200`}>
          <Icon ref={iconRef} className="text-primary" />
        </div>
        <CardTitle className="text-base md:text-lg font-semibold">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="hidden md:block px-0 pt-3">
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
