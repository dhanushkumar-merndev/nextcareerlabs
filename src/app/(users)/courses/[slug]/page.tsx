import { SlugPageWrapper } from "./_components/SlugPageWrapper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Params = Promise<{ slug: string }>;

export default async function SlugPage({ params }: { params: Params }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const { slug } = await params;

  return (
    <SlugPageWrapper 
      slug={slug}
      currentUserId={session?.user?.id}
    />
  );
}
