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
  Trash2,
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
        data.chapter.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          order: chapter.position,
          isOpen:
            prevItems.find((item) => item.id === chapter.id)?.isOpen ?? true,
          lessons: chapter.lesson.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            order: lesson.position,
          })),
        })) || [];
      return updatedItems;
    });
  }, [data]);

  // Detect unsaved changes
  useEffect(() => {
    const changed = JSON.stringify(items) !== JSON.stringify(initialItems);
    setDirty(changed);
  }, [items, initialItems, setDirty]);

  // Sortable Item Component
  function SortableItem({ children, id, className, data }: SortableItemProps) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: id, data: data });

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
          "touch-none",
          className,
          isDragging ? "relative z-999 pointer-events-none" : "z-0"
        )}
      >
        {children(listeners)}
      </div>
    );
  }

  // --------------------------------------
  // DRAG END LOGIC
  // --------------------------------------
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

      if (oldIndex === -1 || newIndex === -1) {
        toast.error("Could not find the chapter to reorder");
        return;
      }

      const reorderLocalChapter = arrayMove(items, oldIndex, newIndex);
      const updatedChapterForState = reorderLocalChapter.map((item, idx) => ({
        ...item,
        order: idx + 1,
      }));
      const previousItems = [...items];

      setItems(updatedChapterForState);
      if (courseId) {
        const chapterToUpdate = updatedChapterForState.map((chapter) => ({
          id: chapter.id,
          position: chapter.order,
        }));

        const reorderChaptersPromise = () =>
          reorderChapters(courseId, chapterToUpdate);

        toast.promise(reorderChaptersPromise(), {
          loading: "Reordering Chapters...",
          success: (result) => {
            if (result.status === "success") return result.message;
            throw new Error(result.message);
          },
          error: () => {
            setItems(previousItems);
            return "An unexpected error occurred. Please try again later";
          },
        });
      }
    }

    // --------------------------------------
    // REORDER LESSONS INSIDE SAME CHAPTER
    // --------------------------------------
    if (activeType === "lesson" && overType === "lesson") {
      const chapterId = over.data.current?.chapterId;
      const overChapterId = over.data.current?.chapterId;

      if (!chapterId || chapterId !== overChapterId) {
        toast.error("Lesson move between different chapters is not allowed");
        return;
      }

      const chapterIndex = items.findIndex(
        (chapter) => chapter.id === chapterId
      );

      if (chapterIndex === -1) {
        toast.error("Could not find the chapter for this lesson");
        return;
      }

      const chapterToUpdate = items[chapterIndex];

      const oldLessonIndex = chapterToUpdate.lessons.findIndex(
        (lesson) => lesson.id === activeId
      );

      const newLessonIndex = chapterToUpdate.lessons.findIndex(
        (lesson) => lesson.id === overId
      );

      if (oldLessonIndex === -1 || newLessonIndex === -1) {
        toast.error("Could not find the lesson to reorder");
        return;
      }

      const reorderLocalLesson = arrayMove(
        chapterToUpdate.lessons,
        oldLessonIndex,
        newLessonIndex
      );

      const updatedLessonForState = reorderLocalLesson.map((lesson, idx) => ({
        ...lesson,
        order: idx + 1,
      }));

      const previousItems = [...items];

      const newItems = [...items];
      newItems[chapterIndex] = {
        ...chapterToUpdate,
        lessons: updatedLessonForState,
      };

      setItems(newItems);

      // Save reorder to server
      if (courseId) {
        const lessonToUpdate = updatedLessonForState.map((lesson) => ({
          id: lesson.id,
          position: lesson.order,
        }));

        const reorderLessonsPromise = () =>
          reorderLessons(chapterId, lessonToUpdate, courseId);

        toast.promise(reorderLessonsPromise(), {
          loading: "Reordering Lessons...",
          success: (result) => {
            if (result.status === "success") return result.message;
            throw new Error(result.message);
          },
          error: () => {
            setItems(previousItems);
            return "An unexpected error occurred. Please try again later";
          },
        });
      }
      return;
    }
  }

  // --------------------------------------
  // TOGGLE CHAPTER OPEN/CLOSE
  // --------------------------------------
  function toggleChapter(chapterId: string) {
    setItems(
      items.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, isOpen: !chapter.isOpen }
          : chapter
      )
    );
  }

  // --------------------------------------
  // DND SENSORS
  // --------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --------------------------------------
  // UI RETURN
  // --------------------------------------
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
                      onOpenChange={() => toggleChapter(item.id)}
                    >
                      <div className="flex items-center justify-between p-3 border-b border-border">
                        <div className="flex items-center gap-2 ">
                          <Button
                            size="icon"
                            variant={"ghost"}
                            className="cursor-grab opacity-60 hover:opacity-100 "
                            {...listeners}
                          >
                            <GripVertical className="size-4" />
                          </Button>

                          <CollapsibleTrigger asChild>
                            <Button
                              size="icon"
                              variant={"ghost"}
                              className="flex items-center cursor-pointer "
                            >
                              {item.isOpen ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>

                          <p className="cursor-pointer hover:text-primary pl-2">
                            {item.title}
                          </p>
                        </div>

                        <DeleteChapter chapterId={item.id} courseId={data.id} />
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
                                data={{ type: "lesson", chapterId: item.id }}
                              >
                                {(lessonListeners) => (
                                  <div className="flex items-center justify-between p-2 hover:bg-accent rounded-sm">
                                    <div className="flex items-center gap-2 ">
                                      <Button
                                        size="icon"
                                        variant={"ghost"}
                                        className="cursor-grab"
                                        {...lessonListeners}
                                      >
                                        <GripVertical className="size-4 " />
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
