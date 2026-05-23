/* This file serves as the entry point for the course detail page. It uses React Suspense to handle the loading state of the page */

import { SlugPageWrapper } from "./_components/SlugPageWrapper";
import { SlugPageSkeleton } from "./_components/SlugPageSkeleton";
import { Suspense } from "react";

// Params Type
type Params = Promise<{ slug: string }>;

// Slug Page Component
export default async function SlugPage({ params }: { params: Params }) {
  // Get slug from params
  const { slug } = await params;

  return (
    <Suspense fallback={<SlugPageSkeleton />}>
      <SlugPageWrapper slug={slug} />
    </Suspense>
  );
}

