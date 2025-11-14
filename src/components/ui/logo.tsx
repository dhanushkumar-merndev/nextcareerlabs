import React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24" // IMPORTANT: Adjust this viewBox to match your actual SVG
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/*
      !!! IMPORTANT !!!
      1. Open your logo.svg file in a text editor.
      2. Copy the <path>, <circle>, etc. elements from it.
      3. Paste them here, replacing the three <path> elements below.
      4. In your pasted code, find any 'fill' or 'stroke' attributes (e.g., fill="blue") and change them to fill="currentColor".
    */}
    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" stroke="none" />
    <path d="M2 17l10 5 10-5" fill="currentColor" stroke="none" />
    <path d="M2 12l10 5 10-5" fill="currentColor" stroke="none" />
  </svg>
);

export { Logo };
