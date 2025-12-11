"use client";

import {
  IconDashboard,
  IconDotsVertical,
  IconLogout,
} from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

import { useRouter } from "next/navigation";
import { HomeIcon, Tv2 } from "lucide-react";
import { useSignOut } from "@/hooks/use-signout";

export function NavUser() {
  const { isMobile, setOpen } = useSidebar();
  const router = useRouter();

  const handleNavigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const handleSignOut = useSignOut();
  const { data: session, isPending } = authClient.useSession();
  if (isPending) {
    return null;
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-2xl ">
                <AvatarImage
                  src={
                    session?.user.image ??
                    `https://avatar.vercel.sh/${encodeURIComponent(
                      session?.user.email ?? ""
                    )}`
                  }
                  alt={session?.user.name}
                />
                <AvatarFallback className="rounded-lg">
                  {(session?.user.name?.trim() || session?.user.email)
                    ?.charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {
                    (session?.user.name?.trim() || session?.user.email)?.split(
                      "@"
                    )[0]
                  }
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {session?.user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={session?.user.image || ""}
                    alt={session?.user.name}
                  />
                  <AvatarFallback className="rounded-lg">
                    {(session?.user.name?.trim() || session?.user.email)
                      ?.charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {
                      (
                        session?.user.name?.trim() || session?.user.email
                      )?.split("@")[0]
                    }
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {session?.user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => handleNavigate("/")}
                className="cursor-pointer"
              >
                <HomeIcon />
                Homepage
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleNavigate("/dashboard")}
                className="cursor-pointer"
              >
                <IconDashboard />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleNavigate("/courses")}
                className="cursor-pointer"
              >
                <Tv2 />
                Courses
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
