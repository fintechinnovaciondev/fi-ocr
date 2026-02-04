export interface StorageFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer?: Buffer;
  size: number;
  path?: string; // Para archivos temporales en disco
}

export interface StorageStrategy {
  upload(file: StorageFile, path: string): Promise<string>;
  delete(path: string): Promise<void>;
  getSignedUrl(path: string): Promise<string>;
  downloadToLocal(remotePath: string): Promise<string>;
}
