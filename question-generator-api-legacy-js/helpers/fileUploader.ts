import { Client, Storage, ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

export class FileUploader {
  async storeFile(fileBuffer, filename) {
    try {
      const client = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);

      const storage = new Storage(client);
      const nodeFile = InputFile.fromBuffer(fileBuffer, filename);
      const fileId = ID.unique();
      await storage.createFile({
        bucketId: process.env.APPWRITE_BUCKET_ID,
        fileId: fileId,
        file: nodeFile,
      });
      return {
        fileId,
        fileName:filename
      }
    } catch (error) {
      console.error("❌ Error in FileUploader.storeFile:", error);
      throw error;
    }
  }
}
