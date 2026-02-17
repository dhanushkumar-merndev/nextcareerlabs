/* This component is used to display a feature card */

"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnimatedIconHandle } from "@/lib/icon-animation";
import type { FeatureCardProps } from "@/lib/types/homePage";

export function FeatureCard({ title, description, Icon }: FeatureCardProps) {
  const iconRef = useRef<AnimatedIconHandle | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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
      // Start animation
      const start = async () => {
        while (!cancelled) {
          await icon?.startAnimation();
          await new Promise((r) => setTimeout(r, 1200));
        }
      };
      // Animation Delay
      const timer = setTimeout(start, 100);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        icon?.stopAnimation();
      };
    }, [isMobile]);
  
  return (
    /* Feature Card */
    <Card 
      onClick={isMobile ? () => setIsExpanded(!isExpanded) : undefined}
      onMouseEnter={ !isMobile ? () => iconRef.current?.startAnimation() : undefined }
      onMouseLeave={!isMobile ? () => iconRef.current?.stopAnimation() : undefined}
      className={`group rounded-xl border bg-card transition-all duration-300 hover:shadow-lg p-4 md:py-9 md:px-9 cursor-pointer md:cursor-default overflow-hidden`}>
      {/* Card Header */}
      <CardHeader className={`flex flex-row items-center gap-4 md:flex-col md:items-start md:gap-3 p-0  ${isMobile ? "-mb-6" : "mb-0"}`}>
        {/* Icon Container */}
        <div className={`size-12 md:size-14 flex items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-200 shrink-0`}>
          <Icon ref={iconRef} className="text-primary" />
        </div>
        {/* Card Title */}
        <CardTitle className="text-base md:text-lg font-semibold flex-1">
          {title}
        </CardTitle>
      </CardHeader>
      
      {/* Card Content - Smooth Expand on Mobile, Always show on Desktop */}
      <div className={`grid transition-all duration-300 ease-in-out ${isMobile ? (isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0") : "grid-rows-[1fr]"}`}>
        <div className="overflow-hidden">
          <CardContent className="px-0 p-0 pt-3">
            <p className="text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
