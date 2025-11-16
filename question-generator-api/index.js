import express from "express";
import { FileUploader } from "./helpers/fileUploader.js";
import { Publisher } from "./helpers/publisher.js";
import dotenv from "dotenv";

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
    const publisher = new Publisher();
    const {fileId, fileName} = await uploader.storeFile(fileBuffer, filename);
    console.log(fileId, fileName);
    await publisher.publish({ fileName: fileName, fileId: fileId });
    console.log("✅ Received filename:", filename);
    console.log("📦 File size:", fileSize, "MB");
    res.json({ message: "File received", filename });
  } catch (error) {
    console.error("❌ Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file." });
  }
});

app.post("/generate-questions", async (req, res) => {
  try {
    // const { textContent, numQuestions } = req.body;
    const publisher = new Publisher();
    await publisher.publishToQuestionGenerationQueue({ fileName: "file1", fileId: "691a1a8d0038c14d5c8c" });
    res.json({ message: "Question generation job queued." });
  } catch (error) {
    console.error("❌ Error generating questions:", error);
    res.status(500).json({ error: "Failed to generate questions." });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
