export const AWS_BUCKET_NAMES = {
    ALL: process.env.AWS_BUCKET_ALL || '',
    CORRECT: process.env.AWS_BUCKET_CORRECT || '',
    INFECTED: process.env.AWS_BUCKET_INFECTED || '',
}

export const AWS_S3_CONFIG = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || '',
    endpoint: process.env.AWS_ENDPOINT || '',
}