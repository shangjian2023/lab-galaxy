import { cookies } from "next/headers";
import { resolveSession, toViewer } from "@/lib/auth-service";
import type { AccountUser, Viewer } from "@/lib/auth-types";

export const SESSION_COOKIE = "lab_galaxy_session";

export async function getCurrentAccount(): Promise<AccountUser | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value)?.user ?? null;
}

export async function getCurrentViewer(): Promise<Viewer | null> {
  return toViewer(await getCurrentAccount());
}
