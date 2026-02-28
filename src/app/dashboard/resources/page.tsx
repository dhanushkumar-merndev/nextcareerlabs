
import { ResourcesClient } from "./_components/ResourcesClient";

export const dynamic = 'force-dynamic';

export default function ResourcesPage() {
  return (
    <div className="flex flex-col -mt-6 md:-mb-6 px-4 lg:px-6 h-[calc(100dvh-1.5rem)] md:h-[calc(100dvh-4.5rem)]  overflow-hidden">
      <ResourcesClient />
    </div>
  );
}
