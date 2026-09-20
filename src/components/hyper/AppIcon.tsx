import lightIcon from "@/assets/light_app_icon.svg";
import darkIcon from "@/assets/dark_app_icon.svg";
import { cn } from "@/lib/utils";

export function AppIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden", className)}>
      <img src={lightIcon} alt="" className="h-full w-full object-contain dark:hidden" />
      <img src={darkIcon} alt="" className="hidden h-full w-full object-contain dark:block" />
    </span>
  );
}
