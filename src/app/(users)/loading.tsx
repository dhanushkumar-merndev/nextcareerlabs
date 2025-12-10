import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      {/* HERO SECTION */}
      <section className="relative py-22 mb-6 px-4 lg:px-6">
        <div className="flex flex-col items-center text-center space-y-8">
          {/* Badge */}
          <Skeleton className="h-6 w-56 rounded-full" />

          {/* Heading */}
          <Skeleton className="h-12 w-3/4 max-w-3xl" />
          <Skeleton className="h-12 w-1/2 max-w-lg" />

          {/* Subheading */}
          <Skeleton className="h-5 w-2/3 max-w-xl" />
          <Skeleton className="h-5 w-1/2 max-w-lg" />

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <Skeleton className="h-12 w-40 rounded-md" />
            <Skeleton className="h-12 w-40 rounded-md" />
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border p-4 py-8 space-y-4 shadow-sm"
          >
            {/* Icon */}
            <Skeleton className="h-14 w-14 rounded-xl mx-auto" />

            {/* Title */}
            <Skeleton className="h-6 w-32 mx-auto" />

            {/* Description */}
            <div className="space-y-2 mt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
