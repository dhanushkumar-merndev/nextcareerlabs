/* This component is used to display the navbar */

"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/themeToggle";
import { UserDropdown } from "./UserDropdown";
import { useSignOut } from "@/hooks/use-signout";
import { useSmartSession } from "@/hooks/use-smart-session";
import { Section } from "@/lib/types/homePage";

// This component is used to display the navbar
export function Navbar() {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const { data: session, isPending } = useSmartSession();
  const handleSignOut = useSignOut();
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [lastScrollY, setLastScrollY] = useState(0);
  const dashboardLink = session?.user?.role === "admin" ? "/admin" : "/dashboard";

// Compact mode on scroll
  useEffect(() => {
    if (!isHomePage || window.innerWidth < 1024) return;
    const ENTER = 180; // px → turn compact ON
    const EXIT = 120; // px → turn compact OFF
    let ticking = false;
    const updateCompact = () => {
      const y = window.scrollY;
      setIsCompact((prev) => {
        if (!prev && y > ENTER) return true;
        if (prev && y < EXIT) return false;
        return prev; // 👈 prevents flicker
      });
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateCompact);
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    updateCompact(); // initial run
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHomePage]);

 // Body lock on mobile
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
  }, [isOpen]);

 // Scroll spy (fixed)
  useEffect(() => {
    if (!isHomePage) return;
    const sections: Section[] = ["programs", "testimonials"];
    let ticking = false;
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const isScrollingDown = currentScrollY > lastScrollY;
      // Dynamic offset based on scroll direction (hysteresis)
      const offset = isScrollingDown ? 250 : 150;
      const scrollPos = currentScrollY + offset;
      let newSection: Section = "home";
      // Find which section we're in
      for (let i = sections.length - 1; i >= 0; i--) {
        const id = sections[i];
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.offsetTop;
        if (scrollPos >= top) {
          newSection = id;
          break;
        }
      }
      // Only update if section actually changed
      setActiveSection((prev) => {
        if (prev !== newSection) {
          return newSection;
        }
        return prev;
      });
      setLastScrollY(currentScrollY);
      ticking = false;
    };
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    onScroll(); // initial run
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isHomePage, lastScrollY]);

 // Route active helper
  const isRouteActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

 // Scroll to section
  const scrollToSection = (id: Section) => {
    if (!isHomePage) return;
    if (id === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.offsetTop - 80, // offset for navbar
      behavior: "smooth",
    });
  };
    // Nav Link Base
    const navLinkBase =
      "relative font-medium transition-colors duration-300 " +
      "before:content-[''] before:absolute before:-bottom-1 " +
      "before:left-1/2 before:-translate-x-1/2 before:h-0.5 " +
      "before:w-0 before:bg-primary before:transition-all " +
    "before:duration-300 before:origin-center hover:before:w-full";


  return (
    <>
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div
          className={`container flex items-center px-4 mx-auto relative transition-all duration-300
          ${isCompact ? "min-h-12" : "min-h-16"}`}
        >
          {/* LOGO */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="h-10 w-10 relative">
              <Image
                src="/logo.svg"
                alt="Skill Force Cloud"
                fill
                className="object-contain dark:hidden"
                priority
              />
              <Image
                src="/blacklogo.svg"
                alt="Skill Force Cloud"
                fill
                className="object-contain hidden dark:block"
                priority
              />
            </div>
            <span className="font-medium">Skill Force Cloud</span>
          </Link>
          {/* ================= DESKTOP NAV CENTERED ================= */}
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8">
            {isHomePage ? (
              <>
                <button
                      onClick={() => scrollToSection("home")}
                      className={`
                        ${navLinkBase}
                        ${
                          activeSection === "home"
                            ? "text-primary"
                            : "text-muted-foreground hover:text-primary"
                        }
                      `}
                    >
                      Home
                    </button>
               <Link
                    href="/courses"
                    className={`
                      ${navLinkBase}
                      ${
                        isRouteActive("/courses")
                          ? "text-primary pointer-events-none "
                          : "text-muted-foreground hover:text-primary"
                      }
                    `}
                  >
                    Courses
                  </Link>
                <Link
                    href={dashboardLink}
                    className={`
                      ${navLinkBase}
                      ${
                        isRouteActive(dashboardLink)
                          ? "text-primary pointer-events-none"
                          : "text-muted-foreground hover:text-primary"
                      }
                    `}
                  >
                    Dashboard
                  </Link>
                {isCompact &&
                  (["programs", "testimonials"] as Section[]).map(
                    (id, index) => (
                     <button
                      key={id}
                      onClick={() => scrollToSection(id)}
                      className={`
                        ${navLinkBase}
                        animate-in fade-in slide-in-from-top-2
                        ${
                          activeSection === id
                            ? "text-primary"
                            : "text-muted-foreground hover:text-primary"
                        }
                      `}
                      style={{
                        animationDelay: `${(index + 3) * 100}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      {id[0].toUpperCase() + id.slice(1)}
                    </button>
                    )
                  )}
              </>
            ) : (
              <>
                <Link
                  href="/"
                  className={`
                    relative font-medium transition-colors duration-300
                    ${
                      pathname === "/"
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }
                    before:content-['']
                    before:absolute
                    before:-bottom-1
                    before:left-1/2
                    before:-translate-x-1/2
                    before:h-0.5
                    before:w-0
                    before:bg-primary
                    before:transition-all
                    before:duration-300
                    before:origin-center
                    hover:before:w-full
                    ${pathname === "/" ? "before:w-full" : ""}
                  `}
                >
                  Home
                </Link>

                <Link
                    href="/courses"
                    className={`
                      relative font-medium transition-colors duration-300
                      ${
                        isRouteActive("/courses")
                          ? "text-primary"
                          : "text-muted-foreground hover:text-primary"
                      }
                      before:content-['']
                      before:absolute
                      before:-bottom-1
                      before:left-1/2
                      before:-translate-x-1/2
                      before:h-0.5
                      before:w-0
                      before:bg-primary
                      before:transition-all
                      before:duration-300
                      before:origin-center
                      hover:before:w-full
                    `}
                  >
                    Courses
                  </Link>
                <Link
                  href={dashboardLink}
                  className={`
                    font-medium transition-colors duration-300
                    ${
                      isRouteActive(dashboardLink)
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }
                  `}
                >
                  Dashboard
                </Link>
              </>
            )}
          </nav>
          {/* ================= DESKTOP RIGHT SIDE ================= */}
          <div className="hidden md:flex items-center gap-2 lg:gap-4 ml-auto">
            <ThemeToggle />

            {!isPending &&
              (session ? (
                <UserDropdown
                  email={session.user.email}
                  name={
                    (session.user.name?.trim() || session.user.email)?.split(
                      "@"
                    )[0]
                  }
                  image={
                    session.user.image ??
                    `https://avatar.vercel.sh/${session.user.email}`
                  }
                />
              ) : (
                <>
                  <Link
                    href="/login"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Login
                  </Link>
                  <Link href="/login" className={buttonVariants()}>
                    Get Started
                  </Link>
                </>
              ))}
          </div>
          {/* ================= MOBILE BUTTONS ================= */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            <ThemeToggle />

            <button
              className="p-2 rounded-md border hover:bg-accent"
              onClick={() => setIsOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      {/* ================= MOBILE SIDEBAR BACKDROP ================= */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={() => setIsOpen(false)}
      />
      {/* ================= MOBILE SIDEBAR ================= */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-background border-r z-60 shadow-xl transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <h2></h2>
          <button
            className="p-2 rounded-md hover:bg-accent"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* PROFILE */}
        {session && (
          <div className="flex flex-col items-center py-6 border-b px-4 text-center">
            <Image
              src={
                session.user.image ??
                `https://avatar.vercel.sh/${session.user.email}`
              }
              alt="profile"
              width={70}
              height={70}
              className="rounded-full border"
              crossOrigin="anonymous"
            />

            <h3 className="mt-3 text-lg font-semibold">
              {session.user.name?.trim() || session.user.email.split("@")[0]}
            </h3>

            <p className="text-sm text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        )}
        {/* MOBILE NAV ITEMS */}
        <nav className="flex flex-col mt-4 px-4 space-y-1">
          {isHomePage ? (
            <>
              {(["home", "programs", "testimonials"] as Section[]).map(
                (id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setIsOpen(false);
                      scrollToSection(id);
                    }}
                    className={`text-[16px] my-1 py-3 px-2 rounded-md font-medium transition text-left ${
                      activeSection === id
                        ? "text-primary font-semibold"
                        : "text-foreground hover:text-primary"
                    }`}
                  >
                    {id[0].toUpperCase() + id.slice(1)}
                  </button>
                )
              )}
              <Link
                href="/courses"
                onClick={() => setIsOpen(false)}
                className={`text-[16px] my-1 py-3 px-2 rounded-md font-medium transition ${
                  isRouteActive("/courses")
                    ? "text-primary font-semibold"
                    : "text-foreground hover:text-primary"
                }`}
              >
                Courses
              </Link>
              <Link
                href={dashboardLink}
                onClick={() => setIsOpen(false)}
                className={`text-[16px] my-1 py-3 px-2 rounded-md font-medium transition ${
                  isRouteActive(dashboardLink)
                    ? "text-primary font-semibold"
                    : "text-foreground hover:text-primary"
                }`}
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                className={`text-[16px] my-1 py-3 px-2 rounded-md font-medium transition ${
                  pathname === "/"
                    ? "text-primary font-semibold"
                    : "text-foreground hover:text-primary"
                }`}
              >
                Home
              </Link>
              <Link
                href="/courses"
                onClick={() => setIsOpen(false)}
                className={`text-[16px] my-1 py-3 px-2 rounded-md font-medium transition ${
                  isRouteActive("/courses")
                    ? "text-primary font-semibold "
                    : "text-foreground hover:text-primary"
                }`}
              >
                Courses
              </Link>
              <Link
                href={dashboardLink}
                onClick={() => setIsOpen(false)}
                className={`text-[16px] my-1 py-3 px-2 rounded-md font-medium transition ${
                  isRouteActive(dashboardLink)
                    ? "text-primary font-semibold"
                    : "text-foreground hover:text-primary"
                }`}
              >
                Dashboard
              </Link>
            </>
          )}
        </nav>
        {/* PUSH CONTENT UP */}
        <div className="flex-1"></div>
        {/* LOGOUT SECTION */}
        <div className="px-4 pb-6">
          {session ? (
            <button
              onClick={handleSignOut}
              className={
                buttonVariants({ variant: "destructive" }) +
                " w-full text-center block"
              }
            >
              Logout
            </button>
          ) : (
            <div className="flex flex-col space-y-3">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className={
                  buttonVariants({ variant: "outline" }) +
                  " w-full text-center block"
                }
              >
                Login
              </Link>
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className={buttonVariants() + " w-full text-center block"}
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
