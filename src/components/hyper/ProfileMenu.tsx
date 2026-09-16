import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, FileText, Settings, ShieldCheck, LogOut, LogIn, User } from "lucide-react";
import { supabase } from "@/config";
import { useSession } from "@/hooks/useSession";
import { endGuest, useGuest } from "@/lib/guest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/terms", label: "Terms of Service", icon: FileText },
  { to: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
] as const;

function initialsFor(value: string) {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function ProfileMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const guest = useGuest();
  const name = (user?.user_metadata?.["full_name"] as string | undefined) ?? user?.email ?? "Guest";
  const initials = user ? initialsFor(name) : null;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="grid h-9 w-9 bg-primary place-items-center rounded-full text-[12px] font-extrabold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {initials || <User className="h-4 w-4" strokeWidth={2} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-[13px] font-bold">{name}</span>
          <span className="text-[11.5px] font-medium text-muted-foreground">
            {user ? user.email : guest ? "Guest preview" : "Not signed in"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <DropdownMenuItem key={l.to} asChild className="cursor-pointer rounded-lg">
              <Link to={l.to} className="flex items-center gap-2.5 text-[13px] font-medium">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                {l.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem
            onSelect={handleSignOut}
            className="cursor-pointer rounded-lg text-[13px] font-medium"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
            Sign out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className="cursor-pointer rounded-lg">
            <Link
              to="/auth"
              onClick={() => endGuest()}
              className="flex items-center gap-2.5 text-[13px] font-medium"
            >
              <LogIn className="h-4 w-4" strokeWidth={1.8} />
              {guest ? "Create account" : "Sign in"}
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
