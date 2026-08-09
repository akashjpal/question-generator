import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { AWS_SQS_CONFIG } from "../config/config";
import dotenv from "dotenv";
dotenv.config();
export class sqsClient {
    private sqsClient: SQSClient;
    constructor() {
        this.sqsClient = new SQSClient({
            endpoint: AWS_SQS_CONFIG.config.endpoint,
            region: AWS_SQS_CONFIG.config.region,
            credentials: {
                accessKeyId: AWS_SQS_CONFIG.config.accessKeyId,
                secretAccessKey: AWS_SQS_CONFIG.config.secretAccessKey
            },
        });
    }

    async publishMessage(payload: object) {
        console.log("Publishing message to SQS:", payload);
        console.log("Using SQS Queue URL:", AWS_SQS_CONFIG.publishQueueUrl);
        const command = new SendMessageCommand({
            QueueUrl: AWS_SQS_CONFIG.publishQueueUrl,
            MessageBody: JSON.stringify(payload),
        });
        const result = await this.sqsClient.send(command);
        console.log("Sent, MessageId:", result.MessageId);
    }

    async publishMessageToDeadLetterQueue(payload: object) {
        console.log("Publishing message to Dead Letter Queue:", payload);
        const command = new SendMessageCommand({
            QueueUrl: AWS_SQS_CONFIG.publishDeadLetterQueueUrl,
            MessageBody: JSON.stringify(payload),
        });
        const result = await this.sqsClient.send(command);
        console.log("Sent to DLQ, MessageId:", result.MessageId);
    }
}
