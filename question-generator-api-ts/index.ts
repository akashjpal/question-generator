import express from "express";
import { FileUploader } from "./helpers/fileUploader.js";
import { Publisher } from "./helpers/publisher.js";
import { statusFetcher } from "./helpers/statusFetcher.js";
import dotenv from "dotenv";
import cors from "cors";
import { SupabaseOperator } from "./helpers/supabseOperator.js";
import type { Assessment } from "./models/assessment.models.js";
import { requireAuth } from "./helpers/requireAuth.js";

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

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
}));

app.get("/", (req, res) => {
  res.send("Question Generator API is running.");
});

app.post("/file-upload", requireAuth, async (req, res) => {
  try {
    const filenameHeader = req.headers["x-filename"];
    const filename = (Array.isArray(filenameHeader) ? filenameHeader[0] : filenameHeader) ?? "";
    const fileSize = req.headers["content-length"] ?? 0 / 1_000_000;
    const fileBuffer = req.body;
    if (!fileBuffer && fileBuffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const uploader = new FileUploader();
    const publisher = new Publisher();
    const {fileId, fileName} = await uploader.storeFileInSupabase(fileBuffer, filename);
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

app.post("/generate-questions", requireAuth,async (req, res) => {
  try {
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
    await publisher.publishToQuestionGenerationQueue({ fileName: fileName, fileId: fileId, bucketId: process.env.APPWRITE_BUCKET_ID, numberOfQuestions: noOfQuestion, jobId: String(jobId), difficultyLevel: difficulty, topic: topic });
    res.json({ message: "Question generation job queued.", jobId: jobId, topic: topic });
  } catch (error) {
    console.error("❌ Error generating questions:", error);
    res.status(500).json({ error: "Failed to generate questions." });
  }
});

app.get("/generate-questions-status/:id", requireAuth, async (req, res) => {
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

  } catch (error: any) {
    console.error(error.message);
    return res.status(500).json({
      message: "Failed to fetch status",
    });
  }
});

app.get("/generated-questions/:id", requireAuth, async(req,res)=>{
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
  }catch(error: any) {
    console.error(error.message);
    return res.status(500).json({
      message: "not able to generate the question"
    });
  }
})


app.post("/update-assessment", requireAuth, async(req,res)=>{
  try {
    const assessment: Assessment = req.body.assessment;
    if(!assessment) {
      return res.status(400).json({
        message: "Assessment data is missing"
      });
    }
    // if(assessment.status === 'draft') {
      const publisher = new Publisher();
      await publisher.handleAssessmentUpdate(assessment, req.user);
      return res.status(200).json({
        message: "assessment updated successfully"
      })
    // }
  }catch(error) {
    console.error(error);
    return res.status(500).json({
      message: "not able to update the assessment"
    });
  }
})


app.post("/publish-assessment", requireAuth, async (req,res)=>{
  try {
    const assessment: Assessment = req.body.assessment;

    if(!assessment) {
        return res.status(400).json({
        message: "Assessment data is missing"
        });
    }
    console.log('Assessment Data Received:', assessment);
    console.log('Publishing Assessment...');
    const publisher = new Publisher();
    await publisher.handleAssessmentPublishing(assessment,true, req.user);
    console.log('Assessment Data Received:', assessment);
    
    return res.status(200).json({
      message: "publishing"
    })
  }catch(error) {
    console.error(error);
    return res.status(500).json({
      message: "not able to publish the assessments"
    });
  }
})

app.post("/api/assessments/:id/publish", requireAuth, async (req, res)=>{
  try{
    const {id} = req.params;
    const publisher = new Publisher();
    const assessment: Assessment | undefined = await publisher.getAssessment(parseInt(id));
    if(assessment) {
      // await publisher.handleAssessmentPublishing(assessment);
      console.log(assessment);
    }
    return res.status(200).json({
      message: "published successfully"
    })
  }catch(error) {
    return res.status(500).json({
      message: "getting error"
    })
  }
})

app.get("/get-assessments", requireAuth, async(req,res)=>{
  try {
    const operator = new SupabaseOperator();
    const data = await operator.getAllAssessmentsForUser(req.user.id);
    console.log(data);
    return res.status(200).json({
      data:data
    });
  }catch(error) {
    console.error(error);
    return res.status(500).json({
      message: "not able to fetch the assessments"
    });
  }
});

app.get("/api/assessments/:id", requireAuth, async (req, res)=>{
  try {
    const { id } = req.params;
    console.log(id);
    const publisher = new Publisher();
    const assessment: Assessment | undefined = await publisher.getAssessment(parseInt(id));
    console.log(assessment);
    if(assessment) {
      return res.status(200).json({
        assessment: assessment
      });
    }
    return res.status(400).json({
      message: `assessment not found with ${id}`
    })
  }catch(error) {
    return res.status(500).json({
      message: "getting error while fetching assessment"
    })
  }
})

app.put("/api/assessments/:id", requireAuth, async(req,res)=>{
  console.log('putting here');
  try{
    const {id} = req.params;
    const data = req.body;
    if(data) {
      const publisher = new Publisher();
      await publisher.handleAssessmentPublishing(data, false, null);
      return res.status(200).json({
        message: `assessment published ${id}`
      })
    }else {
      return res.status(400).json({
        message: "No assessment data recieved"
      })
    }
  }catch(error) {
    return res.status(500).json({
      message: "getting error while publishing"
    })
  }
})

app.delete("/api/assessments/:id", requireAuth, async (req, res)=>{
  try {
    const {id} = req.params;
    if(id) {
      const publisher = new Publisher();
      await publisher.deleteAssessment(parseInt(id));
      return res.status(200).json({
        message: `assessment deleted ${id}`
      });
    }
     return res.status(400).json({
        message: `assessment cannot be deleted ${id}`
      });
  }catch(error) {
    console.error(error);
     return res.status(500).json({
        message: `assessment deletion error`
      });
  }
})


app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
