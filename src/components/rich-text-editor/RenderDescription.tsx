"use client";

import { useMemo } from "react";
import { type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { generateHTML } from "@tiptap/html";
import parse, { HTMLReactParserOptions, Element } from "html-react-parser";

export function RenderDescription({ json }: { json: JSONContent }) {
  const output = useMemo(() => {
    return generateHTML(json, [
      StarterKit,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ]);
  }, [json]);

  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        const tagName = domNode.name.toLowerCase();
        // 1. Block dangerous tags
        if (
          [
            "script",
            "iframe",
            "style",
            "object",
            "embed",
            "link",
            "meta",
            "base",
          ].includes(tagName)
        ) {
          return <></>;
        }

        // 2. Clear dangerous attributes (on*, javascript:)
        if (domNode.attribs) {
          Object.keys(domNode.attribs).forEach((attr) => {
            const attrName = attr.toLowerCase();
            const attrValue = domNode.attribs[attr].toLowerCase();
            if (
              attrName.startsWith("on") ||
              attrValue.includes("javascript:")
            ) {
              delete domNode.attribs[attr];
            }
          });
        }
      }
    },
  };

  return (
    <div className="prose dark:prose-invert prose-li:marker:text-primary prose-h2:text-primary max-w-full overflow-x-hidden">
      {parse(output, options)}
    </div>
  );
}
