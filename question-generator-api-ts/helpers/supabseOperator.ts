import supabase from "./supabaseClient.ts";
export class SupabaseOperator {
  constructor() {
  }

  async getAllAssessments() {
    try {
      const { data, error } = await supabase
        .from("assessment_table")
        .select("id, title, subject, questions, status, difficulty, timeLimit, description")
        .select("*");
      if (error) {
        throw error;
      }
      return data;
    } catch (error: any) {
      console.error("Fetch error:", error.message);
      throw error;
    }
  }

  async getAllAssessmentsForUser(userId: string) {
    try {
      const { data, error } = await supabase
        .from("assessment_table")
        .select("id, title, subject, questions, status, difficulty, timeLimit, description, code, created_at")
        .eq("createdBy", userId)
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      if (!data || data.length === 0) {
        return data;
      }

      // AssessmentResult (attempts) is owned/written by AttemptAPI (.NET), not this
      // service, and has no FK PostgREST can auto-embed — so attemptsCount is
      // computed here via a second query grouped in JS rather than assumed joinable.
      const ids = data.map((row: any) => row.id);
      const { data: results, error: resultsError } = await supabase
        .from("AssessmentResult")
        .select("assessmentId")
        .in("assessmentId", ids);
      if (resultsError) {
        throw resultsError;
      }

      const countsByAssessmentId = new Map<number, number>();
      for (const row of results ?? []) {
        const key = row.assessmentId;
        countsByAssessmentId.set(key, (countsByAssessmentId.get(key) ?? 0) + 1);
      }

      return data.map((row: any) => ({
        ...row,
        attemptsCount: countsByAssessmentId.get(row.id) ?? 0
      }));
    } catch (error: any) {
      console.error("Fetch error:", error.message);
      throw error;
    }
  }

  async isAssessmentCodeAvailable(code: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("assessment_table")
        .select("id")
        .eq("code", code)
        .limit(1);
      if (error) {
        throw error;
      }
      return !data || data.length === 0;
    } catch (error: any) {
      console.error("Code availability check error:", error.message);
      throw error;
    }
  }

  async getGeneratedQuestions(params: { jobId: string }) {
    try {
      console.log(`Fetching questions for jobId: ${params.jobId}`);

      const { data, error } = await supabase
        .from("ai-generated-questions")
        .select("id, question_text, options, correct_options,explanation")
        .eq("jobId", params.jobId)

      if (error) {
        throw error;
      }
      return data;
    } catch (error: any) {
      console.error(`Fetch error for jobId ${params.jobId}:`, error.message);
      throw error;
    }
  }
}
