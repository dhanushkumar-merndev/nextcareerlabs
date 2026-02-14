"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DndContext,
  DraggableSyntheticListeners,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import { AdminCourseSingularType } from "@/app/data/admin/admin-get-course";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { reorderChapters, reorderLessons } from "../actions";
import { NewChapterModel } from "./NewChapterModel";
import { NewLessonModel } from "./NewLessonModel";
import { DeleteLesson } from "./DeleteLesson";
import { DeleteChapter } from "./DeleteChapter";
import { EditChapter } from "./EditChapter";

interface iAppProps {
  data: AdminCourseSingularType;
  setDirty: (dirty: boolean) => void;
}

interface SortableItemProps {
  id: string;
  children: (listeners: DraggableSyntheticListeners) => ReactNode;
  className?: string;
  data?: {
    type: "chapter" | "lesson";
    chapterId?: string;
  };
}

export function CourseStructure({ data, setDirty }: iAppProps) {
  const [isMounted, setIsMounted] = useState(false);
  const initialItems = useMemo(() => {
    return data.chapter.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      order: chapter.position,
      isOpen: true,
      lessons: chapter.lesson.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        order: lesson.position,
      })),
    }));
  }, [data]);

  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setItems((prevItems) => {
      const updated =
        data.chapter
          .map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            order: chapter.position,
            isOpen: prevItems.find((i) => i.id === chapter.id)?.isOpen ?? true,
            lessons: chapter.lesson
              .map((l) => ({
                id: l.id,
                title: l.title,
                order: l.position,
              }))
              .sort((a, b) => a.order - b.order),
          }))
          .sort((a, b) => a.order - b.order) || [];

      return updated;
    });
  }, [data]);

  useEffect(() => {
    const changed = JSON.stringify(items) !== JSON.stringify(initialItems);
    setDirty(changed);
  }, [items, initialItems, setDirty]);

  function SortableItem({ children, id, className, data }: SortableItemProps) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id, data });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        className={cn(
          className,
          isDragging ? "relative z-50 pointer-events-none" : ""
        )}
      >
        {children(listeners)}
      </div>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;
    const courseId = data.id;

    // =====================
    // REORDER CHAPTERS
    // =====================
    if (activeType === "chapter") {
      const targetId =
        overType === "chapter" ? over.id : over.data.current?.chapterId;

      if (!targetId) return;

      const prev = [...items];
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === targetId);

      const reordered = arrayMove(items, oldIndex, newIndex);
      const updated = reordered.map((c, i) => ({ ...c, order: i + 1 }));

      setItems(updated);

      toast.promise(
        reorderChapters(
          courseId,
          updated.map((c) => ({ id: c.id, position: c.order }))
        ),
        {
          loading: "Reordering...",
          success: "Chapters reordered",
          error: () => {
            setItems(prev);
            return "Failed to reorder";
          },
        }
      );

      return;
    }

    // =====================
    // REORDER LESSONS
    // =====================
    if (activeType === "lesson" && overType === "lesson") {
      const chapterId = over.data.current?.chapterId;
      if (!chapterId) return;

      const chapterIndex = items.findIndex((c) => c.id === chapterId);
      const chapter = items[chapterIndex];

      const oldIndex = chapter.lessons.findIndex((l) => l.id === active.id);
      const newIndex = chapter.lessons.findIndex((l) => l.id === over.id);

      const prev = [...items];

      const reordered = arrayMove(chapter.lessons, oldIndex, newIndex);
      const updatedLessons = reordered.map((l, i) => ({
        ...l,
        order: i + 1,
      }));

      const newItems = [...items];
      newItems[chapterIndex] = { ...chapter, lessons: updatedLessons };

      setItems(newItems);

      toast.promise(
        reorderLessons(
          chapterId,
          updatedLessons.map((l) => ({ id: l.id, position: l.order })),
          courseId
        ),
        {
          loading: "Reordering lessons...",
          success: "Lessons reordered",
          error: () => {
            setItems(prev);
            return "Failed to reorder lessons";
          },
        }
      );
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!isMounted) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragEnd={handleDragEnd}
    >
      <Card className="p-0">
        <CardHeader className="flex items-center justify-between border-b px-3 py-3 sm:px-4">
          <CardTitle>Chapters</CardTitle>
          <NewChapterModel courseId={data.id} />
        </CardHeader>

        <CardContent className="p-2 sm:p-4">
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableItem
                key={item.id}
                id={item.id}
                data={{ type: "chapter" }}
              >
                {(listeners) => (
                  <Card className="mb-3 sm:mb-4 overflow-hidden">
                    <Collapsible
                      open={item.isOpen}
                      onOpenChange={() => {
                        setItems(
                          items.map((c) =>
                            c.id === item.id ? { ...c, isOpen: !c.isOpen } : c
                          )
                        );
                      }}
                    >
                      <div className="flex items-center justify-between p-2 sm:p-3 border-b">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="cursor-grab active:cursor-grabbing touch-none opacity-70 hover:opacity-100"
                            {...listeners}
                          >
                            <GripVertical className="size-4" />
                          </Button>

                          <CollapsibleTrigger asChild>
                            <Button size="icon" variant="ghost">
                              {item.isOpen ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>

                          <p className="text-sm sm:text-base font-medium">
                            {item.title}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <EditChapter
                            chapterId={item.id}
                            courseId={data.id}
                            initialName={item.title}
                          />
                          <DeleteChapter
                            chapterId={item.id}
                            courseId={data.id}
                          />
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="p-2 sm:p-3 space-y-1">
                          <SortableContext
                            items={item.lessons}
                            strategy={verticalListSortingStrategy}
                          >
                            {item.lessons.map((lesson) => (
                              <SortableItem
                                key={lesson.id}
                                id={lesson.id}
                                data={{ type: "lesson", chapterId: item.id }}
                              >
                                {(lessonListeners) => (
                                  <div className="flex items-center justify-between p-2 hover:bg-accent rounded-md">
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="cursor-grab active:cursor-grabbing touch-none"
                                        {...lessonListeners}
                                      >
                                        <GripVertical className="size-4" />
                                      </Button>

                                      <FileText className="size-4 text-muted-foreground" />

                                      <Link
                                        href={`/admin/courses/${data.id}/${item.id}/${lesson.id}`}
                                        className="text-sm sm:text-base"
                                      >
                                        {lesson.title}
                                      </Link>
                                    </div>

                                    <DeleteLesson
                                      chapterId={item.id}
                                      courseId={data.id}
                                      lessonId={lesson.id}
                                    />
                                  </div>
                                )}
                              </SortableItem>
                            ))}
                          </SortableContext>

                          <div className="pt-2">
                            <NewLessonModel
                              courseId={data.id}
                              chapterId={item.id}
                            />
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                )}
              </SortableItem>
            ))}
          </SortableContext>
        </CardContent>
      </Card>
    </DndContext>
  );
}
