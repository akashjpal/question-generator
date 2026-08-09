import { describe, expect, test } from "bun:test";
import { Publisher } from "../helpers/publisher";

class FakeSqsClient {
  public sentJobs: unknown[] = [];

  async publishMessage(payload: unknown): Promise<void> {
    this.sentJobs.push(payload);
  }
}

describe("Publisher.publishToQuestionGenerationQueue", () => {
  test("sends the job via the injected SQS client, unchanged", async () => {
    const fakeSqs = new FakeSqsClient();
    const publisher = new Publisher(fakeSqs);

    const job = {
      fileName: "notes.pdf",
      fileId: "file-1",
      numberOfQuestions: 10,
      jobId: "job-1",
      difficultyLevel: "medium",
      topic: "Photosynthesis",
    };

    await publisher.publishToQuestionGenerationQueue(job);

    expect(fakeSqs.sentJobs).toEqual([job]);
  });
});
