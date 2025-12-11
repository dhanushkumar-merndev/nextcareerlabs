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

// ========================================================
// ✅ FIXED SORTABLE ITEM — MOBILE SCROLL FULLY WORKING
// ========================================================
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
      {...attributes} // Only attributes (safe)
      className={cn(
        "touch-none",
        className,
        isDragging ? "relative z-50 pointer-events-none" : "z-0"
      )}
    >
      {children(listeners)} {/* Listeners ONLY sent to drag handle */}
    </div>
  );
}

// -------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------
export function CourseStructure({ data, setDirty }: iAppProps) {
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
    setItems((prevItems) => {
      const updatedItems =
        data.chapter
          .map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            order: chapter.position,
            isOpen:
              prevItems.find((item) => item.id === chapter.id)?.isOpen ?? true,
            lessons: chapter.lesson
              .map((lesson) => ({
                id: lesson.id,
                title: lesson.title,
                order: lesson.position,
              }))
              .sort((a, b) => a.order - b.order),
          }))
          .sort((a, b) => a.order - b.order) || [];

      return updatedItems;
    });
  }, [data]);

  // Detect unsaved changes
  useEffect(() => {
    const changed = JSON.stringify(items) !== JSON.stringify(initialItems);
    setDirty(changed);
  }, [items, initialItems, setDirty]);

  // -------------------------------------------------------
  // DRAG END LOGIC
  // -------------------------------------------------------
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id;
    const overId = over.id;
    const activeType = active.data.current?.type as "chapter" | "lesson";
    const overType = over.data.current?.type as "chapter" | "lesson";
    const courseId = data.id;

    // --------------------------------------
    // REORDER CHAPTERS
    // --------------------------------------
    if (activeType === "chapter") {
      let targetChapterId = null;

      if (overType === "chapter") {
        targetChapterId = overId;
      } else if (overType === "lesson") {
        targetChapterId = over.data.current?.chapterId ?? null;
      }

      if (!targetChapterId) {
        toast.error("Could not determine the chapter to reorder");
        return;
      }

      const oldIndex = items.findIndex((i) => i.id === activeId);
      const newIndex = items.findIndex((i) => i.id === targetChapterId);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(items, oldIndex, newIndex).map(
        (item, idx) => ({ ...item, order: idx + 1 })
      );

      const previousItems = [...items];
      setItems(reordered);

      const chapterToUpdate = reordered.map((chapter) => ({
        id: chapter.id,
        position: chapter.order,
      }));

      toast.promise(() => reorderChapters(courseId, chapterToUpdate), {
        loading: "Reordering Chapters...",
        success: (result) => {
          if (result.status === "success") return result.message;
          throw new Error(result.message);
        },
        error: () => {
          setItems(previousItems);
          return "An unexpected error occurred. Please try again.";
        },
      });
    }

    // --------------------------------------
    // REORDER LESSONS
    // --------------------------------------
    if (activeType === "lesson" && overType === "lesson") {
      const chapterId = over.data.current?.chapterId;

      if (!chapterId) return;

      const chapterIndex = items.findIndex((c) => c.id === chapterId);
      const chapter = items[chapterIndex];

      const oldIdx = chapter.lessons.findIndex((l) => l.id === activeId);
      const newIdx = chapter.lessons.findIndex((l) => l.id === overId);

      const reorderedLessons = arrayMove(chapter.lessons, oldIdx, newIdx).map(
        (l, i) => ({ ...l, order: i + 1 })
      );

      const previousItems = [...items];

      const updatedItems = [...items];
      updatedItems[chapterIndex] = {
        ...chapter,
        lessons: reorderedLessons,
      };

      setItems(updatedItems);

      const lessonToUpdate = reorderedLessons.map((lesson) => ({
        id: lesson.id,
        position: lesson.order,
      }));

      toast.promise(() => reorderLessons(chapterId, lessonToUpdate, data.id), {
        loading: "Reordering Lessons...",
        success: (result) => {
          if (result.status === "success") return result.message;
          throw new Error(result.message);
        },
        error: () => {
          setItems(previousItems);
          return "An unexpected error occurred. Please try again.";
        },
      });
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // -------------------------------------------------------
  // UI RETURN
  // -------------------------------------------------------
  return (
    <DndContext
      autoScroll={false}
      collisionDetection={rectIntersection}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border">
          <CardTitle>Chapters</CardTitle>
          <NewChapterModel courseId={data.id} />
        </CardHeader>

        <CardContent>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableItem
                key={item.id}
                id={item.id}
                data={{ type: "chapter" }}
              >
                {(listeners) => (
                  <Card className="mb-4">
                    <Collapsible
                      open={item.isOpen}
                      onOpenChange={() =>
                        setItems(
                          items.map((chapter) =>
                            chapter.id === item.id
                              ? { ...chapter, isOpen: !chapter.isOpen }
                              : chapter
                          )
                        )
                      }
                    >
                      <div className="flex items-center justify-between p-3 border-b">
                        <div className="flex items-center gap-2">
                          {/* DRAG HANDLE — ONLY HERE WE APPLY LISTENERS */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="cursor-grab"
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

                          <p className="pl-2">{item.title}</p>
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
                        <div className="p-1">
                          <SortableContext
                            items={item.lessons}
                            strategy={verticalListSortingStrategy}
                          >
                            {item.lessons.map((lesson) => (
                              <SortableItem
                                key={lesson.id}
                                id={lesson.id}
                                data={{
                                  type: "lesson",
                                  chapterId: item.id,
                                }}
                              >
                                {(lessonListeners) => (
                                  <div className="flex items-center justify-between p-2 hover:bg-accent rounded-sm">
                                    <div className="flex items-center gap-2">
                                      {/* LESSON DRAG HANDLE */}
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="cursor-grab"
                                        {...lessonListeners}
                                      >
                                        <GripVertical className="size-4" />
                                      </Button>

                                      <FileText className="size-4" />

                                      <Link
                                        href={`/admin/courses/${data.id}/${item.id}/${lesson.id}`}
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

                          <div className="p-2">
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
