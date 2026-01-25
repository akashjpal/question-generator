import express from "express";
import { FileUploader } from "./helpers/fileUploader.js";
import { Publisher } from "./helpers/publisher.js";
import { statusFetcher } from "./helpers/statusFetcher.js";
import dotenv from "dotenv";
import cors from "cors";
import { SupabaseOperator } from "./helpers/supabseOperator.js";

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

app.use(cors());


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
    res.json({ message: "File received", filename, fileId });
  } catch (error) {
    console.error("❌ Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file." });
  }
});

app.post("/generate-questions", async (req, res) => {
  try {
    // const { textContent, numQuestions } = req.body;
    const {
      fileName,
      fileId,
      noOfQuestion,
      difficulty,
      topic
    } = req.body;
    console.log('Topic');
    console.log(topic);
    const publisher = new Publisher();
    const jobId = await publisher.updateQuestionGenerationStatus(0);
    await publisher.publishToQuestionGenerationQueue({ fileName: fileName, fileId: fileId, bucketId: process.env.APPWRITE_BUCKET_ID, numberOfQuestions: noOfQuestion, jobId: jobId, difficultyLevel: difficulty, topic: topic });
    res.json({ message: "Question generation job queued.", jobId: jobId, topic: topic });
  } catch (error) {
    console.error("❌ Error generating questions:", error);
    res.status(500).json({ error: "Failed to generate questions." });
  }
});

app.get("/generate-questions-status/:id", async (req, res) => {
  try {
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({
        message: "jobId is not defined",
      });
    }

    const statusData = await statusFetcher(jobId);

    return res.status(200).json({
      status: statusData,
    });

  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Failed to fetch status",
    });
  }
});

app.get("/generated-questions/:id", async(req,res)=>{
  try {
    const jobId = req.params.id;
    const operator = new SupabaseOperator();
    const result = await operator.getGeneratedQuestions({ jobId: jobId });
    console.log('generated questions');
    console.log(result);
    return res.status(200).json({
      message: "Generated questions",
      questions: result
    })
  }catch(error) {
    console.error(error.message);
  }
})


app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
