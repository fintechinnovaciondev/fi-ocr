import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageStrategy, StorageFile } from './strategies/storage-strategy.interface';
import { LocalStorageStrategy } from './strategies/local-storage.strategy';
import { GcsStorageStrategy } from './strategies/gcs-storage.strategy';
import { OciStorageStrategy } from './strategies/oci-storage.strategy';

@Injectable()
export class StorageService {
  private strategies: Map<string, StorageStrategy> = new Map();
  private currentStorageType: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private configService: ConfigService) {
    this.currentStorageType = this.configService.get<string>('STORAGE_TYPE')?.toLowerCase() || 'local';
    this.logger.log(`Default storage strategy: ${this.currentStorageType}`);
  }

  private getStrategy(type?: string): StorageStrategy {
    const targetType = type?.toLowerCase() || this.currentStorageType;
    
    if (this.strategies.has(targetType)) {
      return this.strategies.get(targetType)!;
    }

    let strategy: StorageStrategy;
    try {
      switch (targetType) {
        case 'gcs':
          strategy = new GcsStorageStrategy();
          break;
        case 'oci':
          strategy = new OciStorageStrategy();
          break;
        case 'local':
        default:
          strategy = new LocalStorageStrategy();
          break;
      }
      this.strategies.set(targetType, strategy);
      return strategy;
    } catch (e) {
      this.logger.error(`Error initializing storage strategy [${targetType}]: ${e.message}`);
      
      // Si la estrategia que falló no es la local, intentamos devolver la local como fallback
      if (targetType !== 'local') {
        return this.getStrategy('local');
      }
      throw e;
    }
  }

  getStorageType(): string {
    return this.currentStorageType;
  }

  async upload(file: StorageFile, path: string, type?: string): Promise<string> {
    return this.getStrategy(type).upload(file, path);
  }

  async delete(path: string, type?: string): Promise<void> {
    return this.getStrategy(type).delete(path);
  }

  async getUrl(path: string, type?: string): Promise<string> {
    return this.getStrategy(type).getSignedUrl(path);
  }

  async getLocalPath(remotePath: string, type?: string): Promise<string> {
    return this.getStrategy(type).downloadToLocal(remotePath);
  }
}
