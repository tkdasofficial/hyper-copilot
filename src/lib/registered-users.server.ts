import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "registered-users.json");

// In-memory cache seeded with known registered users
const registeredEmailsSet = new Set<string>(["tusharkantidasofficial@gmail.com"]);

function loadFromDisk(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (typeof item === "string") {
            registeredEmailsSet.add(item.trim().toLowerCase());
          }
        }
      }
    }
  } catch (err) {
    console.warn("[registered-users] Could not read disk store:", err);
  }
}

function saveToDisk(): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(registeredEmailsSet), null, 2), "utf-8");
  } catch (err) {
    console.warn("[registered-users] Could not persist to disk:", err);
  }
}

// Initial load
loadFromDisk();

export async function isEmailRegistered(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (registeredEmailsSet.has(email)) {
    return true;
  }

  // If service role key is available, query Supabase RPC email_exists
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: exists, error } = await (
        supabaseAdmin.rpc as never as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: boolean | null; error: { message: string } | null }>
      )("email_exists", {
        check_email: email,
      });

      if (!error && Boolean(exists)) {
        await recordRegisteredEmail(email);
        return true;
      }
    } catch (err) {
      console.error("[registered-users] Supabase RPC lookup error:", err);
    }
  }

  return false;
}

export async function recordRegisteredEmail(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) return;

  if (!registeredEmailsSet.has(email)) {
    registeredEmailsSet.add(email);
    saveToDisk();
  }
}
