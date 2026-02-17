import LogoLight from "@/assets/logo.svg";
import LogoDark from "@/assets/blacklogo.svg";
import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  ariaLabel?: string;
}

export function Logo({
  className,
  ariaLabel = "Skill Force Cloud",
  ...props
}: LogoProps) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <LogoLight
        className="w-full h-full dark:hidden"
        role="img"
        aria-label={ariaLabel}
        {...props}
      />
      <LogoDark
        className="w-full h-full hidden dark:block"
        role="img"
        aria-label={ariaLabel}
        {...props}
      />
    </div>
  );
}
