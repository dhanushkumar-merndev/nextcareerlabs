"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Home, BookOpen } from "lucide-react";

export default function NotFound() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes blob {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(20px, -50px) scale(1.1); }
            50% { transform: translate(-20px, 20px) scale(0.9); }
            75% { transform: translate(50px, 50px) scale(1.05); }
          }

          @keyframes grid-move {
            0% { transform: translate(0, 0); }
            100% { transform: translate(40px, 40px); }
          }

          @keyframes float-slow {
            0%, 100% { transform: translateY(0) rotate(45deg); }
            50% { transform: translateY(-30px) rotate(45deg); }
          }

          @keyframes float-slower {
            0%, 100% { transform: translateY(0) translateX(0); }
            50% { transform: translateY(-40px) translateX(20px); }
          }

          @keyframes float-medium {
            0%, 100% { transform: translateY(0) translateX(0); }
            50% { transform: translateY(25px) translateX(-15px); }
          }

          @keyframes gradient-shift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }

          @keyframes fade-in {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .animate-blob {
            animation: blob 12s infinite ease-in-out;
          }

          .animation-delay-2000 {
            animation-delay: 2s;
          }

          .animation-delay-4000 {
            animation-delay: 4s;
          }

          .animation-delay-6000 {
            animation-delay: 6s;
          }

          .animate-grid-move {
            animation: grid-move 20s linear infinite;
          }

          .animate-float-slow {
            animation: float-slow 8s ease-in-out infinite;
          }

          .animate-float-slower {
            animation: float-slower 10s ease-in-out infinite;
          }

          .animate-float-medium {
            animation: float-medium 7s ease-in-out infinite;
          }

          .animate-gradient-shift {
            background-size: 200% 200%;
            animation: gradient-shift 5s ease infinite;
          }

          .animate-fade-in {
            animation: fade-in 0.8s ease-out forwards;
            opacity: 0;
          }

          .bg-grid-pattern {
            background-image: 
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px);
            background-size: 40px 40px;
          }

          .bg-gradient-radial {
            background: radial-gradient(circle at center, transparent 0%, var(--color-background) 100%);
          }
        `,
        }}
      />

      <div className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Animated gradient orbs */}
          <div className="absolute top-0 -left-40 w-80 h-80 bg-primary/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute top-0 -right-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-40 left-20 w-80 h-80 bg-primary/25 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" />
          <div className="absolute bottom-0 right-20 w-80 h-80 bg-primary/15 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-6000" />

          {/* Animated grid pattern */}
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] animate-grid-move" />

          {/* Floating geometric shapes */}
          <div className="absolute top-1/4 left-1/4 w-32 h-32 border border-primary/20 rounded-lg animate-float-slow rotate-45" />
          <div className="absolute top-3/4 right-1/4 w-24 h-24 border border-primary/15 rounded-full animate-float-slower" />
          <div
            className="absolute bottom-1/3 left-1/3 w-20 h-20 border border-primary/10 animate-float-medium"
            style={{ clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }}
          />
        </div>

        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-gradient-radial" />

        {/* Content */}
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          {/* 404 Text with parallax effect */}
          <div
            className="relative"
            style={{
              transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
              transition: "transform 0.2s ease-out",
            }}
          >
            <h1 className="text-[120px] md:text-[180px] font-black text-transparent bg-clip-text bg-linear-to-r from-primary via-primary/70 to-primary/50 leading-none select-none animate-gradient-shift">
              404
            </h1>
            <div className="absolute inset-0 text-[120px] md:text-[180px] font-black text-primary opacity-10 blur-2xl leading-none select-none">
              404
            </div>
          </div>

          {/* Main message */}
          <div className="mt-6 space-y-3">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 animate-fade-in">
              Page Not Found
            </h2>
            <p
              className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              Looks like you have ventured into uncharted territory. The page
              you are looking for does not exist.
            </p>
          </div>

          {/* Action buttons */}
          <div
            className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center animate-fade-in"
            style={{ animationDelay: "0.4s" }}
          >
            <Link
              href="/"
              className="group relative px-6 py-3 bg-primary rounded-full text-primary-foreground text-sm font-semibold hover:scale-105 transition-all duration-300 flex items-center gap-2 overflow-hidden shadow-lg"
            >
              <div className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Home className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Back to Home</span>
            </Link>

            <Link
              href="/courses"
              className="group px-6 py-3 bg-card/50 backdrop-blur-sm rounded-full text-foreground text-sm font-semibold hover:bg-card transition-all duration-300 flex items-center gap-2 border border-border shadow-md"
            >
              <BookOpen className="w-4 h-4" />
              <span>Explore Content</span>
            </Link>
          </div>

          {/* Footer text */}
          <p
            className="mt-12 text-muted-foreground text-xs animate-fade-in"
            style={{ animationDelay: "0.6s" }}
          >
            Need help? Contact our{" "}
            <Link
              href="/support"
              className="text-primary hover:text-primary/80 underline underline-offset-4"
            >
              support team
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
