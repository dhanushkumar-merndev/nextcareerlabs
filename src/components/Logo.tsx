import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  ariaLabel?: string;
}

export function Logo({
  className,
  ariaLabel = "Company Logo",
}: LogoProps) {
  return (
    <span
      className={cn("relative inline-flex h-10 w-10", className)}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Light mode */}
      <Image
        src="/logo.svg"
        alt={ariaLabel}
        fill
        sizes="40px"
        priority
        loading="eager"
        className="object-contain dark:hidden"
      />

      {/* Dark mode */}
      <Image
        src="/blacklogo.svg"
        alt={ariaLabel}
        fill
        sizes="40px"
        priority
        loading="eager"
        className="object-contain hidden dark:block"
      />
    </span>
  );
}
