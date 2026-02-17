/* This component is used to display the footer */

import Link from "next/link";
import { Mail, Youtube, Facebook, Instagram, GraduationCap } from "lucide-react";
import { getAllPublishedCourses } from "@/app/data/course/get-course";
import { SupportFooterLink } from "./SupportFooterLink";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/Logo";

// This component is used to display the footer skeleton
export function FooterSkeleton() {
  return (
    <footer className="border-t bg-background relative overflow-hidden ">
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* BRAND SECTION SKELETON */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-10 rounded-xl" />
              ))}
            </div>
          </div>

          {/* LINKS SKELETONS */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="lg:ml-auto space-y-6">
              <Skeleton className="h-5 w-24 mb-6" />
              <div className="space-y-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-4 w-32" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row items-center justify-center gap-6">
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    </footer>
  );
}

// This component is used to display the footer
export async function Footer() {
  const courses = await getAllPublishedCourses();
  
  return (
    <footer className="border-t bg-background relative overflow-hidden mt-5">
      {/* Decorative background element */}
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* BRAND SECTION */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center gap-2 group w-fit">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center">
                <Logo className="h-full w-full" />
              </div>
              <span className="font-bold text-xl tracking-tight">Skill Force Cloud</span>
            </Link>
            <p className="text-muted-foreground leading-relaxed text-sm max-w-xs">
              Industry-focused training platform helping learners become
              job-ready with real-world skills and expert guidance.
            </p>
            <div className="flex items-center gap-3">
              {[
                { icon: Instagram, label: "Instagram", href: "#" },
                { icon: Facebook, label: "Facebook", href: "#" },
                { icon: Youtube, label: "YouTube", href: "#" },
                { icon: Mail, label: "Email", href: "mailto:support@skillforcecloud.com" },
              ].map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  className="p-2.5 rounded-xl border bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary hover:-translate-y-1 transition-all duration-300 shadow-sm"
                  aria-label={social.label}
                >
                  <social.icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
          {/* PLATFORM LINKS */}
          <div className="lg:ml-auto">
            <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-foreground/70">Platform</h4>
            <ul className="space-y-3">
              {[
                { label: "Courses", href: "/courses" },
                { label: "Dashboard", href: "/dashboard" },
                { label: "Login", href: "/login" },
                { label: "Get Started", href: "/login" },
              ].map((link) => (
                <li key={link.label}>
                  <Link 
                    href={link.href} 
                    className="text-muted-foreground hover:text-primary relative py-1 w-fit block text-sm transition-colors duration-300 group"
                  >
                    {link.label}
                    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* PROGRAMS LINKS */}
          <div className="lg:ml-auto">
            <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-foreground/70">Our Programs</h4>
            <ul className="space-y-3">
              {courses.slice(0, 4).map((course) => (
                <li key={course.id}>
                  <Link 
                    href={`/courses/${course.slug}`} 
                    className="text-muted-foreground hover:text-primary relative py-1 w-fit block text-sm transition-colors duration-300 group"
                  >
                    <span className="truncate max-w-[180px] block">{course.title}</span>
                    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                  </Link>
                </li>
              ))}
              {courses.length === 0 && (
                <li className="text-muted-foreground/50 text-xs italic">No programs available yet</li>
              )}
              {courses.length > 4 && (
                <li>
                  <Link href="/courses" className="text-primary text-xs font-semibold hover:underline">
                    View all courses
                  </Link>
                </li>
              )}
            </ul>
          </div>
          {/* SUPPORT LINKS */}
          <div className="lg:ml-auto">
            <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-foreground/70">Support</h4>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/privacy" 
                  className="text-muted-foreground hover:text-primary relative py-1 w-fit block text-sm transition-colors duration-300 group"
                >
                  Privacy Policy
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                </Link>
              </li>
              <li>
                <Link 
                  href="/terms" 
                  className="text-muted-foreground hover:text-primary relative py-1 w-fit block text-sm transition-colors duration-300 group"
                >
                  Terms & Conditions
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                </Link>
              </li>
              <li>
                <Link 
                  href="https://www.google.com/maps/search/?api=1&query=952,+27th+A+Main+Rd,+Putlanpalya,+Jayanagara+9th+Block,+Jayanagar,+Bengaluru,+Karnataka+560041" 
                  target="_blank"
                  className="text-muted-foreground hover:text-primary relative py-1 w-fit block text-sm transition-colors duration-300 group"
                  aria-label="View our location on Google Maps"
                >
                  Location
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                </Link>
              </li>
              <li>
                <div className="text-muted-foreground flex items-center gap-2 text-sm group cursor-pointer relative py-1 w-fit mt-1">
                   <SupportFooterLink  />
                   <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                </div>
              </li>
            </ul>
          </div>
        </div>
        {/* BOTTOM BAR */}
        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row items-center justify-center gap-6 text-sm">
          <p className="text-muted-foreground order-2 md:order-1">
            © {new Date().getFullYear()} <span className="text-foreground font-semibold">Skill Force Cloud</span>. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
