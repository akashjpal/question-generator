import { Client, Storage, ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import supabase from "./supabaseClient";

export class FileUploader {
  async storeFile(fileBuffer: string, filename: string): Promise<{ fileId: string; fileName: string }> {
    if(!process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY || !process.env.APPWRITE_BUCKET_ID ) {
      throw new Error("Appwrite environment variables are not properly set.");
    }
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
  async storeFileInSupabase(
    fileBuffer: Buffer,
    filename: string,
  ): Promise<{ fileId: string; fileName: string }> {
    if (!process.env.SUPABASE_BUCKET_ID) {
      throw new Error("SUPABASE_BUCKET_ID environment variable is not set.");
    }
    try {
      const uniquePath = `${crypto.randomUUID()}-${filename}`;
      const { error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET_ID)
        .upload(uniquePath, fileBuffer, { upsert: false });

      if (error) throw error;

      return {
        fileId: uniquePath,
        fileName: filename,
      };
    } catch (error) {
      console.error("❌ Error in FileUploader.storeFileInSupabase:", error);
      throw error;
    }
  }
}
