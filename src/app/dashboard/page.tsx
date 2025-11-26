import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="px-4 lg:px-6 py-10 space-y-10">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">
        Quick access to your learning sections.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
        <Link
          href="/dashboard/my-courses"
          className="p-6 border rounded-xl hover:bg-muted transition"
        >
          <h2 className="font-semibold text-xl mb-1">My Courses</h2>
          <p className="text-muted-foreground text-sm">
            View your enrolled courses and continue learning.
          </p>
        </Link>

        <Link
          href="/dashboard/available-courses"
          className="p-6 border rounded-xl hover:bg-muted transition"
        >
          <h2 className="font-semibold text-xl mb-1">Available Courses</h2>
          <p className="text-muted-foreground text-sm">
            Browse courses you can enroll in.
          </p>
        </Link>
      </div>
    </div>
  );
}
