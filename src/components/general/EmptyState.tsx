import { Ban, PlusCircle } from "lucide-react";
import { buttonVariants } from "../ui/button";
import Link from "next/link";

interface iAppProps {
  title: string;
  description: string;
  buttonText: string;
  href: string;
}

export function EmptyState({
  title,
  description,
  buttonText,
  href,
}: iAppProps) {
  return (
    <div className="flex flex-col flex-1 h-full items-center justify-center rounded-md border-dashed border p-8 text-center animate-in fade-in-50">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
        <Ban className="size-10 text-primary" />
      </div>
      <h2 className="mt-6 text-xl font-semibold">{title}</h2>
      <p className=" mb-8 text-center text-sm mt-2 leading-tight text-muted-foreground">
        {description}
      </p>
      <Link href={href} className={buttonVariants()}>
        <PlusCircle className="size-4 mr-2" />
        {buttonText}
      </Link>
    </div>
  );
}
