import { createClient } from "redis";
export class Publisher {
    redisClient;
    constructor() {
        this.redisClient = createClient({ url: "redis://localhost:6379" });
    }

    async connect() {
        try{
            await this.redisClient.connect();
        }catch(error){
            console.error("❌ Error connecting to Redis:", error);
        }
    }

    async publish(job) {
        try{
            await this.connect();
            await this.redisClient.lPush("scan_queue", JSON.stringify(job));
            console.log("✅ Job pushed to Redis queue:", job);
        }catch(error){
            console.error("❌ Error publishing to Redis:", error);
        }
    }

    async publishToQuestionGenerationQueue(job) {
        try {
            await this.connect();
            await this.redisClient.lPush("appwrite_queue", JSON.stringify(job));
            console.log("✅ Job pushed to Question Generation Redis queue:", job);
        }
        catch (error) {
            console.error("❌ Error publishing to Question Generation Redis queue:", error);
        }
    }
}
