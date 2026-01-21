import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getHighResImage(url: string | null | undefined): string {
  if (!url) return "";
  
  // Google profile images often have size parameters like =s96-c
  if (url.includes("googleusercontent.com")) {
    return url.replace(/=s\d+-c/, "=s256-c");
  }
  
  return url;
}
