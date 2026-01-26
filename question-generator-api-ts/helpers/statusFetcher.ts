import supabase from "./supabaseClient.ts";

export async function statusFetcher(jobId: string): Promise<number> {
  try {
    console.log(`Fetching status for jobId: ${jobId}`);

    const { data, error } = await supabase
      .from("ai-generated-question-status")
      .select("status")
      .eq("id", jobId)
      .single();

    if (error) {
      throw error;
    }

    return data.status;
  } catch (error: any) {
    console.error(
      `Status fetch error for jobId ${jobId}:`,
      error.message
    );
    throw error;
  }
}
