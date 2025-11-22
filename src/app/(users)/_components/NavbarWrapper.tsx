"use client";

import dynamic from "next/dynamic";

// Import the *Navbar component*, not the module
const Navbar = dynamic(() => import("./Navbar").then((mod) => mod.Navbar), {
  ssr: false,
});

export default function NavbarWrapper() {
  return <Navbar />;
}
