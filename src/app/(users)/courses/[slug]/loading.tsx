/* This component handles the loading state for the course page, displaying a loader while the course data is being fetched. */

import Loader from "@/components/ui/Loader";

// Loading component for the course page
export default function Loading() {
  return (
    // Flex container to center the loader
    <div className="flex-1 flex items-center justify-center p-4 min-h-[400px]">
      <Loader size={40} />
    </div>
  );
}
