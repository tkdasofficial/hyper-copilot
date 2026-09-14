import { cn } from "@/lib/utils";
import lightIcon from "@/assets/light_app_icon.svg";
import darkIcon from "@/assets/dark_app_icon.svg";

/** Icon swaps with the theme; wordmark uses currentColor. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5 text-foreground", className)}>
      <span className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-lg">
        <img
          src={lightIcon}
          alt="Hyper Copilot logo"
          className="h-full w-full object-contain dark:hidden"
        />
        <img
          src={darkIcon}
          alt="Hyper Copilot logo"
          className="hidden h-full w-full object-contain dark:block"
        />
      </span>
      <span className="text-[15px] font-extrabold tracking-tight">Hyper Copilot</span>
    </span>
  );
}
