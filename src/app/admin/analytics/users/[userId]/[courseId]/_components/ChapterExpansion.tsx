"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ChapterExpansionProps {
    chapter: {
        id: string;
        title: string;
        position: number;
        lesson: any[];
    };
    children: React.ReactNode;
}

export function ChapterExpansion({ chapter, children }: ChapterExpansionProps) {
    const [isOpen, setIsOpen] = useState(chapter.position === 1); // Open first chapter by default

    const completedLessons = chapter.lesson.filter(l => l.lessonProgress[0]?.completed).length;
    const totalLessons = chapter.lesson.length;
    const isChapterCompleted = totalLessons > 0 && completedLessons === totalLessons;

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full border border-border/60 rounded-xl overflow-hidden bg-card/50 transition-all duration-300 hover:border-primary/20"
        >
            <CollapsibleTrigger className="w-full text-left">
                <div className="flex items-center justify-between px-5 py-4 group cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center size-9 rounded-full bg-primary/10 text-primary font-bold text-sm">
                            {chapter.position}
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-foreground">
                                Chapter {chapter.position}
                            </h3>
                            <p className="text-xs text-muted-foreground/60 font-medium">
                                {totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1 rounded-md bg-muted/5 border border-border/10 hidden sm:block">
                            <span className="text-[10px] font-bold text-muted-foreground/60">
                                {totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'}
                            </span>
                        </div>
                        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                            <ChevronDown className="size-4 text-muted-foreground/40" />
                        </div>
                    </div>
                </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
                <div className="px-5 pb-5 flex flex-col gap-2">
                    <div className="h-px bg-border/5 mb-2" />
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
