import { StorageStrategy, StorageFile } from './storage-strategy.interface';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';

export class GcsStorageStrategy implements StorageStrategy {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    const credentialsJson = process.env.GCS_KEYS_JSON;
    
    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        this.storage = new Storage({
          projectId: process.env.GCS_PROJECT_ID || credentials.project_id,
          credentials,
        });
      } catch (e) {
        console.error('[GCS] Error parsing GCS_KEYS_JSON, falling back to keyFilename');
        this.storage = new Storage({
          projectId: process.env.GCS_PROJECT_ID,
          keyFilename: process.env.GCS_KEY_FILE,
        });
      }
    } else {
      this.storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID,
        keyFilename: process.env.GCS_KEY_FILE,
      });
    }
    
    this.bucketName = process.env.GCS_BUCKET || '';
  }

  async upload(file: StorageFile, targetPath: string): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const gcsFile = bucket.file(targetPath);

    if (file.path) {
      // Subir archivo desde disco
      await bucket.upload(file.path, {
        destination: targetPath,
        metadata: { contentType: file.mimetype },
      });
    } else if (file.buffer) {
      // Subir archivo desde buffer
      await gcsFile.save(file.buffer, {
        metadata: { contentType: file.mimetype },
      });
    }

    return targetPath;
  }

  async delete(targetPath: string): Promise<void> {
    await this.storage.bucket(this.bucketName).file(targetPath).delete();
  }

  async getSignedUrl(targetPath: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(targetPath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutos
      });
    return url;
  }

  async downloadToLocal(remotePath: string): Promise<string> {
    const localPath = `uploads/tmp-${Date.now()}-${remotePath.split('/').pop()}`;
    await this.storage.bucket(this.bucketName).file(remotePath).download({
      destination: localPath,
    });
    return localPath;
  }
}
