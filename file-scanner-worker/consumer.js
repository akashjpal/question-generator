import { createClient } from "redis";
import { Client, Storage } from "node-appwrite";
import NodeClam from "clamscan";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const redis = createClient({  url: "redis://localhost:6379",
      password: "myStrongPassword", });
await redis.connect();

const appwrite = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(appwrite);
const bucketId = process.env.APPWRITE_BUCKET_ID;

const clamscan = await new NodeClam().init({
  clamdscan: {
    host: "localhost", // or "host.docker.internal" if running ClamAV in Docker on Windows
    port: 3310,
  },
});

console.log("👂 Worker listening for jobs...");

while (true) {
  const result = await redis.brPop("scan_queue", 0); // Block until a message arrives
  const job = JSON.parse(result.element);

  console.log(`⚙️ Processing file ${job.fileName}`);
  console.log(job);

  try {
    const filePath = `./${job.fileName}`;
    const fileBuffer = await storage.getFileDownload(bucketId, job.fileId);
    fs.writeFileSync(filePath, Buffer.from(fileBuffer));
    console.log("🦠 Scanning file with ClamAV...");
    const { is_infected, viruses } = await clamscan.scanFile(filePath);
    if (is_infected) {
      console.log(`🚨 Infected: ${viruses}`);
      await storage.deleteFile(bucketId, job.fileId);
      console.log(`🗑️ Deleted file ${job.fileName}`);
    } else {
      console.log("✅ Clean file");
    }

    fs.unlinkSync(filePath);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}
