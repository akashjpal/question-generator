import { createClient } from "redis";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import NodeClam from "clamscan";
import fs from "fs";
import dotenv from "dotenv"; 

dotenv.config();

const redis = createClient({  url: process.env.REDIS_URL || "redis://localhost:6379",
      password: process.env.REDIS_PASSWORD || "myStrongPassword", });
await redis.connect();

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const bucketId = process.env.SUPABASE_BUCKET_ID;

const clamscan = await new NodeClam().init({
  clamdscan: {
    host: process.env.CLAMAV_HOST || "localhost",
    port: parseInt(process.env.CLAMAV_PORT || "3310"),
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
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(bucketId)
      .download(job.fileId);
    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);
    const arrayBuffer = await fileBlob.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    console.log("🦠 Scanning file with ClamAV...");
    const { is_infected, viruses } = await clamscan.scanFile(filePath);
    if (is_infected) {
      console.log(`🚨 Infected: ${viruses}`);
      const { error: deleteError } = await supabase.storage
        .from(bucketId)
        .remove([job.fileId]);
      if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);
      console.log(`🗑️ Deleted file ${job.fileName}`);
    } else {
      console.log("✅ Clean file");
    }

    fs.unlinkSync(filePath);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}
