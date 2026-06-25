"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  email: string;
  plan: "free" | "creator" | "pro";
};

function getInitial(email: string) {
  return email.charAt(0).toUpperCase();
}

function truncateEmail(email: string, maxLen = 22) {
  if (email.length <= maxLen) return email;
  const [local, domain] = email.split("@");
  if (!domain) return email.slice(0, maxLen) + "…";
  const maxLocal = maxLen - domain.length - 2;
  return `${local.slice(0, maxLocal)}…@${domain}`;
}

const planLabel: Record<string, string> = {
  free: "Free",
  creator: "Creator",
  pro: "Pro",
};

export function UserMenu({ email, plan }: UserMenuProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted outline-none transition-colors">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold">
          {getInitial(email)}
        </div>
        <div className="flex min-w-0 flex-col items-start">
          <span className="truncate text-xs font-medium text-foreground max-w-[140px]">
            {truncateEmail(email)}
          </span>
          <span className="text-xs text-muted-foreground">
            {planLabel[plan] ?? plan} plan
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/billing" />}>
          <CreditCard className="size-4" />
          Billing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
