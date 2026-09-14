import { Clapperboard, Wand2 } from "lucide-react";

export function VideoAgentIcon({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ""}`}>
      <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.7} />
      <Wand2 className="absolute -right-1 -top-1 h-[10px] w-[10px] text-spectral-2" strokeWidth={2.5} />
    </span>
  );
}
