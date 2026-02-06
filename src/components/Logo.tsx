import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Accessible label for the logo */
  ariaLabel?: string;
}

export function Logo({ 
  className,
  ariaLabel = "Company Logo" 
}: LogoProps) {
  return (
    <div 
      className={cn("relative inline-block overflow-hidden", className)}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Light Mode Logo */}
      <Image
        src="/logo.svg"
        alt={ariaLabel}
        width={40}
        height={40}
        className="h-full w-full object-contain dark:hidden"
        priority
      />

      {/* Dark Mode Logo */}
      <Image
        src="/blacklogo.svg"
        alt={ariaLabel}
        width={40}
        height={40}
        className="h-full w-full object-contain hidden dark:block"
        priority
      />
    </div>
  );
}
