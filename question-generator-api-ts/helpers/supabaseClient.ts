import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseKey) {
  console.warn(
    "⚠️ No Supabase key found in environment. Set SUPABASE_SERVICE_ROLE_KEY for server inserts.",
  );
  throw new Error("Supabase key is not set in environment variables.");
} else if (process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ Using the anon SUPABASE_KEY may trigger RLS restrictions. Prefer SUPABASE_SERVICE_ROLE_KEY for server-side inserts.",
  );
  throw new Error("Supabase service role key is not set in environment variables.");
}

const SUPABASE_URL: string | undefined = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("Supabase URL is not set in environment variables.");
}

const supabase = createClient(SUPABASE_URL, supabaseKey);

export default supabase;
