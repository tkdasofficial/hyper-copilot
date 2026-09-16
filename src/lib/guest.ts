/**
 * Guest preview mode.
 *
 * A visitor can open the whole studio without an account. If the backend allows
 * anonymous sign-ins, the guest gets a real (anonymous) session and can also
 * generate. Otherwise guest mode is browse-only: generating asks for an account.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/config";

const KEY = "hyper:guest";

export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function endGuest() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("hyper:guest-change"));
}

/** Starts guest mode. Returns whether a real anonymous session was created. */
export async function startGuest(): Promise<{ session: boolean }> {
  window.localStorage.setItem(KEY, "1");
  window.dispatchEvent(new Event("hyper:guest-change"));

  const { data } = await supabase.auth.getSession();
  if (data.session) return { session: true };

  const { data: anon, error } = await supabase.auth.signInAnonymously();
  return { session: !error && Boolean(anon.session) };
}

export function useGuest() {
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    const sync = () => setGuest(isGuest());
    sync();
    window.addEventListener("hyper:guest-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hyper:guest-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return guest;
}
