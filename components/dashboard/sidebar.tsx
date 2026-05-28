"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Scissors,
  LayoutDashboard,
  Upload,
  Video,
  CreditCard,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

type Profile = {
  email: string;
  plan: "free" | "creator" | "pro";
  credits_remaining: number;
} | null;

type SidebarProps = {
  profile: Profile;
  userEmail: string;
};

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/videos", label: "My Videos", icon: Video },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {navLinks.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ profile, userEmail, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5">
        <Scissors className="size-5 text-slate-900 dark:text-slate-100" />
        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Clipper</span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        <NavItems pathname={pathname} onNavigate={onNavigate} />
      </div>

      {/* User menu */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <UserMenu
          email={profile?.email ?? userEmail}
          plan={profile?.plan ?? "free"}
        />
      </div>
    </div>
  );
}

export function Sidebar({ profile, userEmail }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 z-30">
        <SidebarContent profile={profile} userEmail={userEmail} />
      </aside>

      {/* Mobile: hamburger button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 flex size-9 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm dark:bg-slate-950 dark:border-slate-800"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Mobile: overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile: drawer */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
        <SidebarContent
          profile={profile}
          userEmail={userEmail}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>
    </>
  );
}
