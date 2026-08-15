import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AWS_BUCKET_NAMES, AWS_S3_CONFIG } from "../config/config";
import crypto from "crypto";

export class s3Client {
    private s3Client: S3Client;

    constructor() {
        this.s3Client = new S3Client({
            region: AWS_S3_CONFIG.region,
            endpoint: AWS_S3_CONFIG.endpoint,
            forcePathStyle: true,
            requestChecksumCalculation: "WHEN_REQUIRED",
            credentials: {
                accessKeyId: AWS_S3_CONFIG.accessKeyId,
                secretAccessKey: AWS_S3_CONFIG.secretAccessKey,
            },
        });
    }

    async storeFileInAwsBucket(
        fileBuffer: Buffer,
        filename: string): Promise<{ fileId: string; fileName: string }> {
        if (!AWS_BUCKET_NAMES.ALL) {
            throw new Error("AWS_BUCKET_ALL environment variable is not set.");
        }
        // store the file in the AWS S3 bucket using the s3Client instance
        try {
            const uniquePath = `${crypto.randomUUID()}-${filename}`;
            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: AWS_BUCKET_NAMES.ALL,
                    Key: uniquePath,
                    Body: fileBuffer,
                })
            );
            return { fileId: uniquePath, fileName: filename };
        } catch (error) {
            console.error("❌ Error in FileUploader.storeFileInAwsBucket:", error);
            throw error;
        }
    }
}