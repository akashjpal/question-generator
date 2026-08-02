import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import NodeClam from "clamscan";

dotenv.config();

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL,   // points to MiniStack locally; ignored/undefined on real AWS
  forcePathStyle: true,
});

let clamscanPromise;
function getClamscan() {
  if (!clamscanPromise) {
    clamscanPromise = new NodeClam().init({
      clamdscan: {
        host: process.env.CLAMAV_HOST || "localhost",
        port: parseInt(process.env.CLAMAV_PORT || "3310"),
      },
    });
  }
  return clamscanPromise;
}

// Entry point — Lambda calls this
export const handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    console.log(`New file detected: ${key} in ${bucket}`);

    const fileBuffer = await downloadFile(bucket, key);
    const isClean = await scanFile(fileBuffer, key);

    if (isClean) {
      await moveToCleanFolder(bucket, key);
    } else {
      await quarantineFile(bucket, key);
    }
  }
  return { statusCode: 200 };
};

// Downloads the uploaded object fully into memory
async function downloadFile(bucket, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

async function scanFile(buffer, key) {
  const clamscan = await getClamscan();
  const uniqueName = `${crypto.randomUUID()}-${path.basename(key)}`;
  const tmpPath = path.join(os.tmpdir(), uniqueName);

  await fs.writeFile(tmpPath, buffer);

  try {
    const { isInfected, viruses } = await clamscan.scanFile(tmpPath);
    if (isInfected) {
      console.log(`🚨 Infected: ${viruses.join(", ")}`);
    } else {
      console.log("✅ Clean file");
    }
    return !isInfected;
  } finally {
    await fs.unlink(tmpPath).catch(() => { });
  }
}

// Moves clean files into a "clean/" prefix in the same bucket
async function moveToCleanFolder(bucket, key) {
  const newKey = `${key}`;
  await s3.send(new CopyObjectCommand({ Bucket: process.env.AWS_BUCKET_CORRECT, CopySource: `${bucket}/${key}`, Key: newKey }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log(`Moved to ${newKey}`);
}

// Moves infected files into a "quarantine/" prefix
async function quarantineFile(bucket, key) {
  const newKey = `${key}`;
  await s3.send(new CopyObjectCommand({ Bucket: process.env.AWS_BUCKET_INFECTED, CopySource: `${bucket}/${key}`, Key: newKey }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log(`Quarantined to ${newKey}`);
}