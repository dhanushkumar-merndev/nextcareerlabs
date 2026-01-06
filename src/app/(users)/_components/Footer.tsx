"use client";

import Link from "next/link";
import { Github, Linkedin, Twitter, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-14">
        {/* TOP GRID */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* BRAND */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <span className="font-bold text-primary">S</span>
              </div>
              <span className="font-semibold text-lg">Skill Force Cloud</span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Industry-focused training platform helping learners become
              job-ready with real-world skills.
            </p>

            <div className="flex items-center gap-3">
              <Link
                href="#"
                className="p-2 rounded-md border hover:bg-accent transition"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                className="p-2 rounded-md border hover:bg-accent transition"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                className="p-2 rounded-md border hover:bg-accent transition"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </Link>
              <Link
                href="mailto:support@skillforcecloud.com"
                className="p-2 rounded-md border hover:bg-accent transition"
                aria-label="Email"
              >
                <Mail className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* LINKS */}
          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/courses" className="hover:text-primary">
                  Courses
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-primary">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-primary">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-primary">
                  Get Started
                </Link>
              </li>
            </ul>
          </div>

          {/* PROGRAMS */}
          <div>
            <h4 className="font-semibold mb-4">Programs</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/programs/salesforce-development"
                  className="hover:text-primary"
                >
                  Salesforce Development
                </Link>
              </li>
              <li>
                <Link
                  href="/programs/devops-engineering"
                  className="hover:text-primary"
                >
                  DevOps Engineering
                </Link>
              </li>
              <li>
                <Link
                  href="/programs/mern-stack"
                  className="hover:text-primary"
                >
                  MERN Stack Development
                </Link>
              </li>
            </ul>
          </div>

          {/* SUPPORT */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/contact" className="hover:text-primary">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-primary">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-primary">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="mt-12 pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Skill Force Cloud. All rights reserved.
          </p>

          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-primary">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-primary">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-primary">
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
