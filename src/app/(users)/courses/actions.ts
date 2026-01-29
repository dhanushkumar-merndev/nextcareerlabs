/**
 * getAllCoursesAction
 *
 * Server action wrapper for fetching public courses.
 *
 * - Acts as a thin layer between client components and data layer
 * - Supports pagination via cursor
 * - Supports optional search by title
 * - Uses clientVersion for cache validation (ETag-like behavior)
 *
 * @param clientVersion Optional version string from client cache
 * @param userId Optional user ID (used for personalization / enrollment status)
 * @param cursor Pagination cursor for infinite scrolling
 * @param searchQuery Optional course title search query
 */

"use server";
import { getAllCourses } from "@/app/data/course/get-all-courses";

export async function getAllCoursesAction(
  clientVersion?: string,
  userId?: string,
  cursor?: string | null,
  searchQuery?: string,
  onlyAvailable?: boolean
) {
  return getAllCourses(clientVersion, userId, cursor, searchQuery, onlyAvailable);
}
