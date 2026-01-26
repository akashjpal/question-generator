import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseKey) {
  console.warn(
    "⚠️ No Supabase key found in environment. Set SUPABASE_SERVICE_ROLE_KEY for server inserts.",
  );
} else if (process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ Using the anon SUPABASE_KEY may trigger RLS restrictions. Prefer SUPABASE_SERVICE_ROLE_KEY for server-side inserts.",
  );
}

const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

export default supabase;
