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
            <div className="h-8 w-8">
              {/* SVG LOGO */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 125 109"
                className="h-full w-full"
              >
                <path
                  d="M0 0 C1.2583949 0.59459605 2.51092323 1.20171716 3.75830078 1.8190918 C4.44030548 2.14478653 5.12231018 2.47048126 5.82498169 2.80604553 C8.03975772 3.86628331 10.24653602 4.9421516 12.45361328 6.01831055 C14.74463988 7.12044063 17.03748147 8.21873309 19.3303833 9.31695557 C20.86649239 10.05315288 22.40193401 10.7907445 23.93670654 11.52972412 C31.76342738 15.29402115 39.66602676 18.88307447 47.59375 22.4296875 C48.49625488 22.83791748 49.39875977 23.24614746 50.32861328 23.66674805 C51.49650391 24.18954346 51.49650391 24.18954346 52.68798828 24.72290039 C54.57861328 25.70581055 54.57861328 25.70581055 56.57861328 27.70581055 C56.51611328 30.14331055 56.51611328 30.14331055 55.57861328 32.70581055 C51.54413052 35.70581055 51.54413052 35.70581055 48.57861328 35.70581055 C48.57861328 51.54581055 48.57861328 67.38581055 48.57861328 83.70581055 C50.55861328 84.36581055 52.53861328 85.02581055 54.57861328 85.70581055 C56.57795376 88.42651822 56.82135739 90.71372318 56.77392578 94.03393555 C56.76893066 94.75484375 56.76393555 95.47575195 56.75878906 96.21850586 C56.74058105 97.12181641 56.72237305 98.02512695 56.70361328 98.95581055 C56.66236328 101.84331055 56.62111328 104.73081055 56.57861328 107.70581055 C48.65861328 107.70581055 40.73861328 107.70581055 32.57861328 107.70581055 C32.47548828 104.67393555 32.37236328 101.64206055 32.26611328 98.51831055 C32.22059326 97.57189697 32.17507324 96.6254834 32.12817383 95.65039062 C32.05407282 91.14648373 32.1355756 89.28183181 34.97314453 85.5925293 C37.57861328 83.70581055 37.57861328 83.70581055 39.57861328 83.70581055 C39.57861328 69.18581055 39.57861328 54.66581055 39.57861328 39.70581055 C35.10298828 41.56206055 30.62736328 43.41831055 26.01611328 45.33081055 C23.34714887 46.43181406 20.67794273 47.53223216 18.00830078 48.6315918 C13.83454049 50.35094809 9.66882527 52.08573181 5.52392578 53.8737793 C4.84531494 54.1610791 4.1667041 54.44837891 3.4675293 54.74438477 C1.78322014 55.45809417 0.10446608 56.18487561 -1.57373047 56.9128418 C-6.73198197 58.34922733 -11.26659631 56.54347038 -16.10375977 54.62036133 C-17.19476486 54.18966339 -18.28576996 53.75896545 -19.40983582 53.31521606 C-20.5725148 52.84856537 -21.73519379 52.38191467 -22.93310547 51.90112305 C-24.13828323 51.42134003 -25.343461 50.94155701 -26.5851593 50.44723511 C-29.12765537 49.43409287 -31.6682972 48.41646302 -34.20776367 47.39575195 C-37.45894233 46.08953124 -40.71496468 44.79590241 -43.97253704 43.50572395 C-47.08731979 42.26981274 -50.19745013 41.02238625 -53.30810547 39.77612305 C-55.06123299 39.0822197 -55.06123299 39.0822197 -56.84977722 38.3742981 C-57.93132584 37.93729584 -59.01287445 37.50029358 -60.12719727 37.05004883 C-61.07950729 36.66889923 -62.03181732 36.28774963 -63.01298523 35.89505005 C-65.37077779 34.73080062 -66.81165953 33.77234967 -68.42138672 31.70581055 C-68.50732422 29.23706055 -68.50732422 29.23706055 -67.42138672 26.70581055 C-65.26799168 25.25750946 -63.39205537 24.24946017 -61.04638672 23.20581055 C-60.35810791 22.88104736 -59.6698291 22.55628418 -58.96069336 22.22167969 C-57.37315512 21.47275099 -55.78212321 20.73120248 -54.18847656 19.99536133 C-49.90164708 17.99756414 -45.6531325 15.92157155 -41.39819336 13.85693359 C-36.77208811 11.6171162 -32.13462088 9.40134545 -27.49755859 7.18432617 C-24.84476367 5.9093003 -22.20130432 4.61784069 -19.56201172 3.31518555 C-18.24437228 2.67441886 -16.92667123 2.03377884 -15.60888672 1.39331055 C-14.52994141 0.86092773 -13.45099609 0.32854492 -12.33935547 -0.2199707 C-7.75107125 -1.90909809 -4.58321375 -1.73366748 0 0 Z"
                  fill="#4262ED"
                  transform="translate(68.42138671875,1.294189453125)"
                />
                <path
                  d="M0 0 C7.8330929 0.23414136 15.05234842 4.00347075 22.1953125 6.9375 C34.21213793 11.66592504 41.80500377 7.74009246 53.28320312 3.0625 C54.31509766 2.65773437 55.34699219 2.25296875 56.41015625 1.8359375 C57.33965088 1.46001465 58.26914551 1.0840918 59.22680664 0.69677734 C62.48065048 -0.1207656 64.75892731 0.24831712 68 1 C68.86928276 3.39127957 69.72051601 5.78661726 70.5625 8.1875 C70.9327832 9.19780273 70.9327832 9.19780273 71.31054688 10.22851562 C72.69712075 14.23200359 73.54556196 16.99866755 72 21 C69.35131836 22.62158203 69.35131836 22.62158203 65.83984375 24.0078125 C65.21654678 24.25997528 64.59324982 24.51213806 63.95106506 24.77194214 C61.95341213 25.57496594 59.94618358 26.35003971 57.9375 27.125 C56.61191676 27.65316081 55.28703702 28.1830909 53.96289062 28.71484375 C51.42824839 29.7290179 48.8877254 30.7249499 46.33935547 31.70410156 C44.37943449 32.46468502 42.42647681 33.24459899 40.49267578 34.06933594 C33.56909441 36.97325176 28.76535613 35.08347517 22.02734375 32.3828125 C21.38181046 32.12498993 20.73627716 31.86716736 20.07118225 31.60153198 C18.71449939 31.05806297 17.35899767 30.51163697 16.00463867 29.96240234 C13.94300471 29.12722997 11.87717613 28.30319103 9.81054688 27.48046875 C-1.20067782 23.05632415 -1.20067782 23.05632415 -6 20 C-4.57142857 4.57142857 -4.57142857 4.57142857 0 0 Z"
                  fill="#4262ED"
                  transform="translate(29,54)"
                />
              </svg>
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
                    font-medium transition-all duration-300
                    ${isCompact ? "animate-in fade-in slide-in-from-top-2" : ""}
                    ${
                      activeSection === "home"
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }
                  `}
                  style={
                    isCompact
                      ? {
                          animationDelay: "0ms",
                          animationFillMode: "both",
                        }
                      : {}
                  }
                >
                  Home
                </button>
                <Link
                  href="/courses"
                  className={`
                    font-medium transition-all duration-300
                    ${isCompact ? "animate-in fade-in slide-in-from-top-2" : ""}
                    ${
                      isRouteActive("/courses")
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }
                  `}
                  style={
                    isCompact
                      ? {
                          animationDelay: "100ms",
                          animationFillMode: "both",
                        }
                      : {}
                  }
                >
                  Courses
                </Link>
                <Link
                  href={dashboardLink}
                  className={`
                    font-medium transition-all duration-300
                    ${isCompact ? "animate-in fade-in slide-in-from-top-2" : ""}
                    ${
                      isRouteActive(dashboardLink)
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }
                  `}
                  style={
                    isCompact
                      ? {
                          animationDelay: "200ms",
                          animationFillMode: "both",
                        }
                      : {}
                  }
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
                          font-medium transition-all duration-300
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
                    font-medium transition-colors duration-300
                    ${
                      isRouteActive("/courses")
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }
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
