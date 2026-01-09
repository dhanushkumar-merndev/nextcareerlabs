
"use client";

import dynamic from "next/dynamic";
import { type ComponentProps } from "react";
import { ChatLayout } from "./ChatLayout";

const DynamicChatLayout = dynamic(
  () => import("./ChatLayout").then((mod) => mod.ChatLayout),
  {
    ssr: false,
    loading: () => <div className="flex-1 min-h-0 bg-muted/20 animate-pulse" />,
  }
);

export function ChatLayoutLoader(props: ComponentProps<typeof ChatLayout>) {
  return <DynamicChatLayout {...props} />;
}
