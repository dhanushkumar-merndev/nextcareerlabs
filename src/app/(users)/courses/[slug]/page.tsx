/**
 * Course Details Page
 */

import { SlugPageWrapper } from "./_components/SlugPageWrapper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
// Params Type
type Params = Promise<{ slug: string }>;

// Slug Page Component
export default async function SlugPage({ params }: { params: Params }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  // Get slug from params
  const { slug } = await params;

  return (
    <SlugPageWrapper 
      slug={slug}
      currentUserId={session?.user?.id}
    />
  );
}
