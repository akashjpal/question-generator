import { createClient as createRedisClient } from "redis";
import supabase from "./supabaseClient.ts";
export class Publisher {
  redisClient;
  constructor() {
    this.redisClient = createRedisClient({
      url: "redis://localhost:6379",
      password: "myStrongPassword",
    });
    
  }

  async connect() {
    try {
      await this.redisClient.connect();
    } catch (error) {
      console.error("❌ Error connecting to Redis:", error);
    }
  }

  // TODO: remove any
  async publish(job: any) {
    try {
      await this.connect();
      await this.redisClient.lPush("scan_queue", JSON.stringify(job));
      console.log("✅ Job pushed to Redis queue:", job);
    } catch (error) {
      console.error("❌ Error publishing to Redis:", error);
    }
  }

  async updateQuestionGenerationStatus(status: number) {
    const { data, error } = await supabase
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

  // TODO: remove any
  async publishToQuestionGenerationQueue(job: any) {
    try {
      await this.connect();
      await this.redisClient.lPush("appwrite_queue", JSON.stringify(job));
      console.log(job.topic);
      console.log("✅ Job pushed to Question Generation Redis queue:", job);
    } catch (error) {
      console.error(
        "❌ Error publishing to Question Generation Redis queue:",
        error
      );
    }
  }
}
