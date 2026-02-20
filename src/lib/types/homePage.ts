import { HTMLAttributes } from "react";
import { AnimatedIconHandle } from "../icon-animation";

export interface FeatureCardProps {
  title: string;
  description: string;
  Icon: React.ForwardRefExoticComponent<
    React.PropsWithoutRef<HTMLAttributes<HTMLDivElement>> &
      React.RefAttributes<AnimatedIconHandle>
  >;
  isExpanded?: boolean;
  onToggle?: () => void;
}
export interface PhoneNumberDialogProps {
  isOpen: boolean;
  requireName?: boolean; // true for email OTP users without a name
}

export type Section = "home" | "programs" | "testimonials";


export interface UserDropdownProps {
  name: string;
  email: string;
  image: string;
  role?: string;
}