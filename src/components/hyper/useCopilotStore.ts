import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/copilot-store";

export function useCopilotStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
