import { type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  // TODO: Implement Supabase auth check using "Thin Proxy" pattern
  // - Only check cookie existence here
  // - Heavy session validation goes in Server Components
  // - Avoid Supabase "logout loop" bug by syncing cookies properly
}

export const config = {
  matcher: [],
};
