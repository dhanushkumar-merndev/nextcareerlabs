import Loader from "@/components/ui/Loader";

export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 min-h-[400px]">
      <Loader size={40} />
    </div>
  );
}
