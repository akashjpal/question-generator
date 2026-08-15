import { createClient as createRedisClient } from "redis";
import supabase from "./supabaseClient.ts";
import { sqsClient as SqsClient } from "./sqsClient.ts";
import { AssessmentStatus, type Assessment, type AssessmentPublishModel, type PublishQuestionModel, type Question } from "../models/assessment.models.ts";
export class Publisher {
  redisClient;
  sqsClient: Pick<SqsClient, "publishMessage">;
  constructor(sqsClient: Pick<SqsClient, "publishMessage"> = new SqsClient()) {
    this.redisClient = createRedisClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      password: process.env.REDIS_PASSWORD || "myStrongPassword",
    });
    this.sqsClient = sqsClient;
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
    return data.id;
  }

  // TODO: remove any
  async publishToQuestionGenerationQueue(job: any) {
    await this.sqsClient.publishMessage(job);
    console.log("✅ Job dispatched to question-generator-worker via SQS:", job);
  }

  async disconnect() {
    try {
      await this.redisClient.disconnect();
    } catch (error) {
      console.error("❌ Error disconnecting from Redis:", error);
    }
  }

  async publishQuestion(question: PublishQuestionModel[]): Promise<string[]> {
    const { data, error } = await supabase
      .from("ai-generated-questions")
      .upsert(question, { onConflict: "id" })
      .select('id');
    if (error) throw error;
    return (data || []).map((q: any) => q.id);
  }

  async publishAssessment(assessment: AssessmentPublishModel) {
    try {
      // If an id is present, update the existing assessment, otherwise insert a new one
      const id = (assessment as any).id;
      let data: any = null;
      let error: any = null;
      console.log("Publishing assessment:", assessment);
      // if (id) {
        const res = await supabase
          .from("assessment_table")
          .upsert(assessment)
          .eq("id", id)
          .select();
        data = res.data;
        error = res.error;
      // } else {
      //   const res = await supabase
      //     .from("assessment_table")
      //     .insert([assessment])
      //     .select();
      //   data = res.data;
      //   error = res.error;
      // }
      if (error) {
        console.error("Error publishing assessment:", error);
        throw error;
      }
      return data;
    }catch(error) {
      console.error("Error publishing assessment:", error);
      throw error;
    }
  }

  // async updateAssessment(assessment: AssessmentPublishModel) {
  //   try {
  //     // If an id is present, update the existing assessment, otherwise insert a new one
  //     const id = (assessment as any).id;
  //     let data: any = null;
  //     let error: any = null;
  //     console.log("Updating assessment:", assessment);
  //     if (id !== undefined && id !== null) {
  //       const res = await supabase
  //         .from("assessment_table")
  //         .update(assessment)
  //         .eq("id", id)
  //         .select();
  //       data = res.data;
  //       error = res.error;
  //     } else {
  //       const res = await supabase
  //         .from("assessment_table")
  //         .insert([assessment])
  //         .select();
  //       data = res.data;
  //       error = res.error;
  //     }
  //     if (error) {
  //       throw error;
  //     }
  //     return data;
  //   }catch(error) {
  //     throw error;
  //   }
  // }
  
  async updateAssessmentStatus(id: number): Promise<Assessment | undefined> {
    try{
      const {data, error} = await supabase
        .from("assessment_table")
        .update({status: AssessmentStatus.published})
        .eq("id", id)
        .select();
      if (error) {
        throw error;
      }
      if(data && data.length > 0) {
        return data[0] as Assessment;
      }
      return undefined;
    }catch(error) {
      console.error("Error while getting assessment", error);
    }
  }

  async getAssessment(id: number): Promise<Assessment | undefined> {
    try{
      const {data, error} = await supabase
        .from("assessment_table")
        .select("*")
        .eq("id", id);
        if (error) {
          throw error;
        }
        if(data) {
        const assessment: Assessment = data[0];

        let questionGuids: string[] = [];

        if (typeof assessment.questions === 'string') {
          try {
            questionGuids = JSON.parse(assessment.questions);
          } catch (jsonError) {
            console.error("Error parsing questions JSON string:", jsonError);
            questionGuids = [];
          }
        } else if (Array.isArray(assessment.questions)) {
          questionGuids = assessment.questions as string[];
        }

        if (questionGuids.length > 0) {
          const fetchedQuestions: Question[] | undefined = await this.parseQuestion(questionGuids);
          if (fetchedQuestions) {
            assessment.questions = fetchedQuestions; // This line assigns the array of Question objects
          } else {
            assessment.questions = [];
          }
        } else {
            assessment.questions = [];
        }
        
        return assessment;
        }
      return undefined;
    }catch(error) {
      console.error("Error while getting assessment", error);
    }
  }

  async parseQuestion(qIds: string | null | undefined): Promise<Question[] | undefined> {
    try {
      console.log("data");
      console.log(qIds, qIds?.length);
      if (!qIds || qIds.length === 0) {
        return undefined; // Return undefined if qIds is null, undefined, or empty
      }
      const {data, error} = await supabase
      .from("ai-generated-questions")
      .select("*")
      .in("id", qIds);

      console.log("data");
      console.log(data);
      if(error) {
        throw error;
      }
      return data as Question[];
    }catch(error) {
      console.error("parsed questions");
    }
  }

  async handleAssessmentUpdate(assessment: Assessment, user: any) {
    const questions = assessment.questions;

    const toInsert: PublishQuestionModel[] = questions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      options: q.options,
      correct_options: q.correct_options,
      explanation: q.explanation,
    }));
    let allQuestionIds: string[] = assessment.questions.map(q => q.id);
    // edit case when assessment is already published
    if(questions.length != assessment.questionsCount && assessment.status === 0) {
       allQuestionIds = await this.publishQuestion(toInsert);
    }

    const newAssessment: AssessmentPublishModel = {
      id: assessment.id,
      topic: assessment.topic,
      difficulty: (assessment.difficulty as string).toLowerCase() as AssessmentPublishModel['difficulty'],
      description: assessment.description,
      title: assessment.title,
      subject: assessment.subject,
      createdBy: user?.id ?? assessment.createdBy ?? '',
      questionsCount: questions.length,
      status: (assessment.status as AssessmentStatus),
      questions: allQuestionIds,
      code: assessment.code,
      timeLimit: assessment.timeLimit,
      fileId: assessment.fileId,
      updatedAt: Date.now().toString(),
      publishedAt: Date.now().toString()
    };

    await this.publishAssessment(newAssessment);
  }

  async handleAssessmentPublishing(assessment: Assessment, isQuestionPublish: boolean = true, user: any) {
    const questions = assessment.questions;

    const toInsert: PublishQuestionModel[] = questions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      options: q.options,
      correct_options: q.correct_options,
      explanation: q.explanation,
    }));
    const allQuestionIds = await this.publishQuestion(toInsert);

    const newAssessment: AssessmentPublishModel = {
      id: assessment.id,
      topic: assessment.topic,
      difficulty: (assessment.difficulty as string).toLowerCase() as AssessmentPublishModel['difficulty'],
      description: assessment.description,
      title: assessment.title,
      subject: assessment.subject,
      createdBy: user?.id ?? assessment.createdBy ?? '',
      questionsCount: questions.length,
      status: isQuestionPublish ? AssessmentStatus.published : (assessment.status as AssessmentStatus),
      questions: allQuestionIds,
      code: assessment.code,
      timeLimit: assessment.timeLimit,
      fileId: assessment.fileId,
      updatedAt: Date.now().toString(),
      publishedAt: Date.now().toString()
    };

    if (!isQuestionPublish) {
      newAssessment.id = assessment.id;
    }

    await this.publishAssessment(newAssessment);
  }

  async deleteAssessment(id: number): Promise<Assessment | undefined> {
    try {
      const { data, error } = await supabase
        .from("assessment_table")
        .delete()
        .eq("id", id)
        .select();
      if (error) {
        throw error;
      }
      if (data && data.length > 0) {
        console.log(data[0]);
        return data[0] as Assessment;
      }
      return undefined;
    } catch (error) {
      console.error(error);
    }
  }
}
