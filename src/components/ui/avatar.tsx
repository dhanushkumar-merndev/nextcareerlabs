"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import Image from "next/image";

import { cn } from "@/lib/utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

// Create a custom interface that's compatible with Next.js Image
interface AvatarImageProps
  extends Omit<
    React.ComponentProps<typeof AvatarPrimitive.Image>,
    "src" | "width" | "height"
  > {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
}

function AvatarImage({
  className,
  src,
  alt = "",
  width = 32,
  height = 32,
  ...props
}: AvatarImageProps) {
  if (!src) {
    return null;
  }

  return (
    <Image
      data-slot="avatar-image"
      alt={alt}
      className={cn("aspect-square size-full", className)}
      width={width}
      height={height}
      src={src}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
