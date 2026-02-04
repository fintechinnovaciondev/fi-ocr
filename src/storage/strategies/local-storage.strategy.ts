import { StorageStrategy, StorageFile } from './storage-strategy.interface';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

export class LocalStorageStrategy implements StorageStrategy {
  private readonly uploadDir = 'uploads';

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(file: StorageFile, targetPath: string): Promise<string> {
    // Si el archivo ya está en disco y es la misma ruta, no hacemos nada
    if (file.path && (file.path === targetPath || path.resolve(file.path) === path.resolve(targetPath))) {
      return targetPath;
    }
    
    // Si viene de otro path en disco, lo movemos/copiamos
    if (file.path) {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.copyFileSync(file.path, targetPath);
      return targetPath;
    }
    
    // Si viene de memoria, lo guardamos
    const fullPath = targetPath;
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (file.buffer) {
      await writeFile(fullPath, file.buffer);
    }
    return fullPath;
  }

  async delete(targetPath: string): Promise<void> {
    if (fs.existsSync(targetPath)) {
      await unlink(targetPath);
    }
  }

  async getSignedUrl(targetPath: string): Promise<string> {
    // En local la URL firmada es simplemente la ruta relativa servida por express
    // main.ts configura app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
    return `/${targetPath}`;
  }

  async downloadToLocal(remotePath: string): Promise<string> {
    return remotePath;
  }
}
