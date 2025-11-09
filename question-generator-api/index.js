import express from "express";
import dotenv from "dotenv";
import { FileUploader } from "./helpers/fileUploader.js";

const app = express();
const PORT = process.env.PORT || 3000;
dotenv.config();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  express.raw({
    type: [
      "application/pdf", // PDFs
      "application/octet-stream", // Word docs
    ],
    limit: "10mb",
  })
);

app.get("/", (req, res) => {
  res.send("Question Generator API is running.");
});

app.post("/file-upload", async (req, res) => {
  try {
    const filename = req.headers["x-filename"];
    const fileSize = req.headers["content-length"] / 1_000_000;
    const fileBuffer = req.body;
    if (!fileBuffer && fileBuffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const uploader = new FileUploader();
    await uploader.storeFile(fileBuffer, filename);
    console.log("✅ Received filename:", filename);
    console.log("📦 File size:", fileSize, "MB");
    res.json({ message: "File received", filename });
  } catch (error) {
    console.error("❌ Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file." });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
