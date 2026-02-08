import { createClient as createRedisClient } from "redis";
import supabase from "./supabaseClient.ts";
import type { Assessment, AssessmentPublishModel, PublishQuestionModel, Question } from "../models/assessment.models.ts";
export class Publisher {
  redisClient;
  constructor() {
    this.redisClient = createRedisClient({
      url: "redis://localhost:6379",
      password: "myStrongPassword",
    });
    
  }

  async connect() {
    try {
      await this.redisClient.connect();
    } catch (error) {
      console.error("❌ Error connecting to Redis:", error);
    }
  }

  // TODO: remove any
  async publish(job: any) {
    try {
      await this.connect();
      await this.redisClient.lPush("scan_queue", JSON.stringify(job));
      console.log("✅ Job pushed to Redis queue:", job);
    } catch (error) {
      console.error("❌ Error publishing to Redis:", error);
    }
  }

  async updateQuestionGenerationStatus(status: number) {
    const { data, error } = await supabase
      .from("ai-generated-question-status")
      .insert([
        {
            status: status
        },
      ])
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    console.log("New job created:", data);
    return data.id;
  }

  // TODO: remove any
  async publishToQuestionGenerationQueue(job: any) {
    try {
      await this.connect();
      await this.redisClient.lPush("appwrite_queue", JSON.stringify(job));
      console.log(job.topic);
      console.log("✅ Job pushed to Question Generation Redis queue:", job);
    } catch (error) {
      console.error(
        "❌ Error publishing to Question Generation Redis queue:",
        error
      );
    }
  }

  async disconnect() {
    try {
      await this.redisClient.disconnect();
    } catch (error) {
      console.error("❌ Error disconnecting from Redis:", error);
    }
  }

  async publishQuestion(question: PublishQuestionModel[]) {
    try {
      const { data, error } = await supabase
        .from("ai-generated-questions")
        .insert(question);
      if (error) {
        throw error;
      }
      console.log("Questions published:", data);
    }catch(error) {
      console.error("❌ Error publishing questions:", error);
    }
  }

  async publishAssessment(assessment: AssessmentPublishModel) {
    try {
      const { data, error } = await supabase
        .from("assessment_table")
        .insert(assessment);
      if (error) {
        throw error;
      }
      console.log("Assessment published:", data);
    }catch(error) {
      console.error("❌ Error publishing assessment:", error);
    }
  }

  async handleAssessmentPublishing(assessment: Assessment) {
    try {
      const questions = assessment.questions;
      const publishQuestions: PublishQuestionModel[] = questions.map((q) => ({
        question_text: q.question_text,
        options: q.options,
        correct_options: q.correct_options,
        explanation: q.explanation
      }));
      const newAssessment: AssessmentPublishModel = {
        topic: assessment.topic,
        difficulty: assessment.difficulty,
        description: assessment.description,
        title: assessment.title,
        subject: assessment.subject,
        createdBy: assessment.createdBy,
        questionsCount: assessment.questionsCount,
        status: 1,
        questions: questions.map((q) => q.id),
        code: assessment.code,
        timeLimit: assessment.timeLimit,
        fileId: assessment.fileId,
        updatedAt: Date.now().toString(),
        publishedAt: Date.now().toString()
      };
      await this.publishQuestion(publishQuestions);
      await this.publishAssessment(newAssessment);
    }catch(error) {
      console.error("❌ Error handling assessment publishing:", error);
    }
  }
}
