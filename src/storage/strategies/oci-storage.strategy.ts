import { StorageStrategy, StorageFile } from './storage-strategy.interface';
import * as os from 'oci-objectstorage';
import * as common from 'oci-common';
import * as fs from 'fs';

export class OciStorageStrategy implements StorageStrategy {
  private client: os.ObjectStorageClient;
  private namespace: string;
  private bucketName: string;

  constructor() {
    // Intentar leer configuración de variables de entorno o archivo
    const provider = new common.ConfigFileAuthenticationDetailsProvider(
        process.env.OCI_CONFIG_FILE || undefined,
        process.env.OCI_PROFILE || 'DEFAULT'
    );

    this.client = new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
    this.namespace = process.env.OCI_NAMESPACE || '';
    this.bucketName = process.env.OCI_BUCKET || '';
  }

  async upload(file: StorageFile, targetPath: string): Promise<string> {
    let body: any;
    if (file.path) {
        body = fs.createReadStream(file.path);
    } else if (file.buffer) {
        body = file.buffer;
    }

    const putObjectRequest: os.requests.PutObjectRequest = {
      namespaceName: this.namespace,
      bucketName: this.bucketName,
      putObjectBody: body,
      objectName: targetPath,
      contentType: file.mimetype,
    };

    await this.client.putObject(putObjectRequest);
    return targetPath;
  }

  async delete(targetPath: string): Promise<void> {
    const deleteObjectRequest: os.requests.DeleteObjectRequest = {
      namespaceName: this.namespace,
      bucketName: this.bucketName,
      objectName: targetPath,
    };
    await this.client.deleteObject(deleteObjectRequest);
  }

  async getSignedUrl(targetPath: string): Promise<string> {
    // OCI Pre-Authenticated Requests (PAR)
    // Para simplificar, generaremos una PAR temporal de lectura
    const createParRequest: os.requests.CreatePreauthenticatedRequestRequest = {
      namespaceName: this.namespace,
      bucketName: this.bucketName,
      createPreauthenticatedRequestDetails: {
        name: 'read-par-' + Date.now(),
        accessType: os.models.CreatePreauthenticatedRequestDetails.AccessType.ObjectRead,
        objectName: targetPath,
        timeExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutos
      }
    };

    const response = await this.client.createPreauthenticatedRequest(createParRequest);
    
    // Devolvemos la URL completa
    const region = process.env.OCI_REGION || 'us-ashburn-1';
    return `https://objectstorage.${region}.oraclecloud.com${response.preauthenticatedRequest.accessUri}`;
  }

  async downloadToLocal(remotePath: string): Promise<string> {
    const localPath = `uploads/tmp-${Date.now()}-${remotePath.split('/').pop()}`;
    const getObjectRequest: os.requests.GetObjectRequest = {
        namespaceName: this.namespace,
        bucketName: this.bucketName,
        objectName: remotePath,
    };
    const response = await this.client.getObject(getObjectRequest);
    
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(localPath);
        (response.value as any).pipe(writer);
        writer.on('finish', () => resolve(localPath));
        writer.on('error', reject);
    });
  }
}
