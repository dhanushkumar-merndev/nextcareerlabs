
import Link from "next/link";
import { Mail, Youtube, Facebook, Instagram, GraduationCap } from "lucide-react";
import { getAllPublishedCourses } from "@/app/data/course/get-course";
import { SupportFooterLink } from "./SupportFooterLink";
import { Skeleton } from "@/components/ui/skeleton";

export function FooterSkeleton() {
  return (
    <footer className="border-t bg-background/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-20 w-full text-foreground/20" />
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-9 rounded-md" />
              ))}
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4 lg:ml-auto">
              <Skeleton className="h-6 w-24" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-4 w-32" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    </footer>
  );
}

export async function Footer() {
  const courses = await getAllPublishedCourses();
  
  return (
    <footer className="border-t bg-background relative overflow-hidden">
      {/* Decorative background element */}
      
      
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* BRAND SECTION */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center gap-2 group w-fit">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all duration-300">
                <GraduationCap className="h-6 w-6 text-primary" />
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
                { label: "Get Started", href: "/register" },
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
