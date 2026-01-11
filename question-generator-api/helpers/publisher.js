import { createClient as createRedisClient } from "redis";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
export class Publisher {
  redisClient;
  supabaseClient;
  constructor() {
    this.redisClient = createRedisClient({
      url: "redis://localhost:6379",
      password: "myStrongPassword",
    });
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!supabaseKey) {
      console.warn(
        "⚠️ No Supabase key found in environment. Set SUPABASE_SERVICE_ROLE_KEY for server inserts."
      );
    } else if (process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn(
        "⚠️ Using the anon SUPABASE_KEY may trigger RLS restrictions. Prefer SUPABASE_SERVICE_ROLE_KEY for server-side inserts."
      );
    }

    this.supabaseClient = createSupabaseClient(
      process.env.SUPABASE_URL,
      supabaseKey
    );
  }

  async connect() {
    try {
      await this.redisClient.connect();
    } catch (error) {
      console.error("❌ Error connecting to Redis:", error);
    }
  }

  async publish(job) {
    try {
      await this.connect();
      await this.redisClient.lPush("scan_queue", JSON.stringify(job));
      console.log("✅ Job pushed to Redis queue:", job);
    } catch (error) {
      console.error("❌ Error publishing to Redis:", error);
    }
  }

  async updateQuestionGenerationStatus(status) {
    const { data, error } = await this.supabaseClient
      .from("ai-generated-question-status")
      .insert([
        {
            status: status
        },
      ])
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    console.log("New job created:", data);
    return data.id;
  }

  async publishToQuestionGenerationQueue(job) {
    try {
      await this.connect();
      await this.redisClient.lPush("appwrite_queue", JSON.stringify(job));
      console.log("✅ Job pushed to Question Generation Redis queue:", job);
    } catch (error) {
      console.error(
        "❌ Error publishing to Question Generation Redis queue:",
        error
      );
    }
  }
}
