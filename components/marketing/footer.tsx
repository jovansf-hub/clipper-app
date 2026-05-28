import Link from "next/link";
import { Scissors } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <Scissors className="size-4 text-indigo-600" />
              <span className="font-bold text-slate-900">Clipper</span>
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              AI-powered video clipping for creators
            </p>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <Link href="/#pricing" className="transition-colors hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/login" className="transition-colors hover:text-slate-900">
              Login
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-slate-900">
              Terms
            </Link>
          </nav>

          <p className="text-sm text-slate-500">© 2026 Clipper</p>
        </div>
      </div>
    </footer>
  );
}
