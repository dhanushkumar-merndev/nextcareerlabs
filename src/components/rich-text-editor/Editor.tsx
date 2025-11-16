"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Menubar } from "./Menubar";

export function RichTextEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    immediatelyRender: false,
  });

  return (
    <div>
      <Menubar editor={editor} />
    </div>
  );
}
