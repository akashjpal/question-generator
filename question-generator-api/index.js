import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({
  type: [
    'application/pdf', // PDFs
    'application/octet-stream', // Word docs
  ],
  limit: '10mb'
 }));

app.get("/", (req, res) => {
  res.send("Question Generator API is running.");
});

app.post("/file-upload", (req, res) => {
  const filename = req.headers["x-filename"];
  const fileSize = req.headers["content-length"] / 1_000_000;
  const fileBuffer = req.body;
  console.log(fileSize);
  console.log(req.headers);
  console.log(fileBuffer);
  if(!fileBuffer && fileBuffer.length === 0) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  console.log("✅ Received filename:", filename);
  console.log("📦 File size:", fileSize, "MB");

  res.json({ message: "File received", filename });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
