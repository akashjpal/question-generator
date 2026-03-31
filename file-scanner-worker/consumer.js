import { createClient } from "redis";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import NodeClam from "clamscan";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const redis = createClient({  url: "redis://localhost:6379",
      password: "myStrongPassword", });
await redis.connect();

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const bucketId = process.env.SUPABASE_BUCKET_ID;

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
