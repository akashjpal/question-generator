import supabase from "./supabaseClient.js";
export class SupabaseOperator {
  constructor() {
  }

  async getGeneratedQuestions(params) {
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
    } catch (error) {
      console.error(`Fetch error for jobId ${params.jobId}:`, error.message);
      throw error;
    }
  }
}
