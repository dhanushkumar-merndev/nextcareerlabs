"use client";

import React from "react";

interface MessageContentProps {
  content: string;
  className?: string;
}

export function MessageContent({ content, className = "" }: MessageContentProps) {
  // Simple markdown parser for basic formatting
  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    
    return lines.map((line, lineIndex) => {
      // Parse bold text (**text**)
      const parts: (string | React.ReactElement)[] = [];
      let currentText = line;
      let partIndex = 0;
      
      // Match **bold** patterns
      const boldRegex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(line)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          parts.push(currentText.substring(lastIndex, match.index));
        }
        
        // Add bold text
        parts.push(
          <strong key={`bold-${lineIndex}-${partIndex++}`} className="font-semibold">
            {match[1]}
          </strong>
        );
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < line.length) {
        parts.push(currentText.substring(lastIndex));
      }
      
      // If no formatting was found, just return the line
      if (parts.length === 0) {
        parts.push(line);
      }
      
      return (
        <span key={`line-${lineIndex}`}>
          {parts}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      );
    });
  };
  
  return (
    <div className={className}>
      {parseMarkdown(content)}
    </div>
  );
}
