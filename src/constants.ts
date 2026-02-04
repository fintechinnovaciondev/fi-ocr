import * as dotenv from 'dotenv';
dotenv.config();

export const OCR_QUEUE_NAME = process.env.REDIS_NAME || 'ocr-queue';
export const OCR_QUEUE_PREFIX = process.env.REDIS_PREFIX || 'moso';
