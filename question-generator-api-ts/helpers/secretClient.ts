import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { AWS_S3_CONFIG } from "../config/config";
const client = new SecretsManagerClient({
    region: AWS_S3_CONFIG.region,
    endpoint: AWS_S3_CONFIG.endpoint,
    credentials: {
        accessKeyId: AWS_S3_CONFIG.accessKeyId,
        secretAccessKey: AWS_S3_CONFIG.secretAccessKey,
    },
})

export async function getSecret(secretName: string): Promise<string> {
    const res = await client.send(new GetSecretValueCommand({ SecretId: `question-generator/${secretName}` }));
    if (!res.SecretString) throw new Error(`Secret ${secretName} has no string value`);
    return res.SecretString;
}