import { SlugPageWrapper } from "./_components/SlugPageWrapper";
import { Suspense } from "react";

// Params Type
type Params = Promise<{ slug: string }>;

// Slug Page Component
export default async function SlugPage({ params }: { params: Params }) {
  // Get slug from params
  const { slug } = await params;

  return (
    <Suspense>
      <SlugPageWrapper slug={slug} />
    </Suspense>
  );
}

