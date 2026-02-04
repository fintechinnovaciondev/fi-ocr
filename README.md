# Fintech Innovation - Servicio de OCR y Extracción de Datos

Servicio avanzado de procesamiento de documentos y reconocimiento óptico de caracteres (OCR) construido con NestJS. Permite la ingesta asíncrona de archivos y la extracción de datos estructurados utilizando múltiples motores de IA y OCR tradicional.

## 🚀 Características Principales

- **Motores de OCR Multi-Estrategia**:
  - **PaddleOCR**: Motor de alto rendimiento para documentos multilingües y detección de ángulos.
  - **Tesseract.js**: OCR tradicional basado en motor LSTM.
  - **Ollama (LLM Vision)**: Extracción inteligente utilizando modelos de lenguaje (ej. Llama 3 Vision) para interpretar documentos complejos.
  - **PdfText**: Extracción nativa de texto para PDFs vectoriales.
- **Almacenamiento Híbrido**: Soporte para almacenamiento Local, Google Cloud Storage (GCS) y Oracle Cloud Infrastructure (OCI).
- **Procesamiento Asíncrono**: Arquitectura basada en eventos y colas utilizando BullMQ y Redis para manejar cargas pesadas sin bloquear la API.
- **Panel de Administración**: 
  - Gestión de procesos en tiempo real (SSE).
  - Rotación de imágenes y re-procesamiento.
  - Validación de datos extraídos mediante reglas de negocio negociables.
  - Registro de auditoría (Logs) por proceso.
- **Logging Empresarial**: Integración completa con `@fintechinnovaciondev/fi-utils` para trazabilidad y formato estandarizado.

## 📁 Estructura del Proyecto

```text
src/
├── admin/       # Controladores y servicios para el dashboard de administración
├── auth/        # Estrategias de seguridad (API Key, Google OAuth2)
├── common/      # Configuraciones compartidas y middleware (Logs, fi-utils)
├── ocr/         # Corazón del sistema: estrategias de extracción y orquestación
│   └── strategies/ # Implementaciones específicas: Tesseract, Paddle, Ollama, etc.
├── schemas/     # Modelos de datos MongoDB (Mongoose)
├── storage/     # Abstracción de sistema de archivos (Local, GCS, OCI)
├── tenant/      # Lógica de gestión de clientes y configuraciones por tenant
├── views/       # Interfaz de usuario (Handlebars) del panel administrativo
└── main.ts      # Punto de entrada de la aplicación
```

## 🛠️ Requisitos e Instalación

### Requisitos Previos

- **Docker y Docker Compose** (Recomendado para manejar dependencias de Python/PaddleOCR).
- **Node.js 22** (Si se corre localmente).
- **Redis** (Para la gestión de colas).
- **MongoDB** (Persistencia de datos).

### Instalación con Docker

1. Configura el archivo `.env` (ver sección de variables de entorno).
2. Construye y levanta los servicios:

```bash
# Setea el token para paquetes privados de GitHub
export NPM_TOKEN=tu_token_aqui

# Construye e inicia
docker-compose up --build -d
```

### Desarrollo Local

```bash
# Instalación de dependencias
npm install

# Iniciar en modo observación
npm run start:dev
```

## ⚙️ Variables de Entorno (.env)

| Categoría | Variable | Descripción | Ejemplo / Valor |
| :--- | :--- | :--- | :--- |
| **Base de Datos** | `MONGO_URI` | Cadena de conexión a MongoDB (ReplicaSet soportado) | `mongodb://ocr:ocr@10.20.125.60:30000...` |
| **Colas (Redis)** | `REDIS_HOST` | Host del servidor Redis | `10.20.125.60` |
| | `REDIS_PORT` | Puerto de Redis | `30379` |
| | `REDIS_USER` | Usuario de Redis | `fi_moso` |
| | `REDIS_PASSWORD` | Contraseña de Redis | `fi_moso_pass` |
| | `REDIS_NAME` | Nombre de la cola (BullMQ) | `ocr-queue` |
| | `REDIS_PREFIX` | Prefijo para las llaves en Redis | `moso` |
| **IA (Ollama)** | `OLLAMA_URL` | URL de la API de Ollama | `http://10.20.125.60:31434/api/generate` |
| | `OLLAMA_MODEL` | Modelo de lenguaje a utilizar | `ministral-3:14b` |
| | `OLLAMA_TIMEOUT_MS` | Tiempo de espera máximo para la IA | `300000` |
| **Auth & App** | `GOOGLE_CLIENT_ID` | ID de cliente OAuth2 de Google | `950827011061-h35...` |
| | `GOOGLE_CLIENT_SECRET`| Secreto de cliente OAuth2 de Google | `GOCSPX-2T7m...` |
| | `ADMIN_EMAIL` | Email del administrador para acceso al panel | `aortiz@fintechinversiones.com.py` |
| | `SESSION_SECRET` | Secreto para firmar las cookies de sesión | `a_very_secure_string...` |
| | `PORT` | Puerto de escucha de la aplicación | `3000` |
| **Storage** | `STORAGE_TYPE` | Estrategia activa (`local`, `gcs`, `oci`) | `gcs` |
| **GCS** | `GCS_PROJECT_ID` | ID del proyecto en Google Cloud | `fintech-ia-labs` |
| (si aplica) | `GCS_BUCKET` | Nombre del Bucket en GCS | `ocr-bucket-dev` |
| | `GCS_KEYS_JSON` | JSON completo de la Service Account | `{"type": "service_account", ...}` |
| **OCI** | `OCI_NAMESPACE` | Namespace de Oracle Cloud | `tu-namespace` |
| (si aplica) | `OCI_BUCKET` | Nombre del Bucket en OCI | `tu-bucket` |
| | `OCI_REGION` | Región de OCI | `us-ashburn-1` |
| **Build** | `NPM_TOKEN` | Token para acceso a paquetes privados de GitHub | `ghp_XmpH...` |

## 📦 Sistema de Cache de Imágenes

Para optimizar el rendimiento de la interfaz, el sistema implementa una **cache local de imágenes**. Cuando se solicita la imagen de un proceso almacenado en la nube (GCS/OCI):
1. El sistema verifica si el archivo ya existe en la carpeta `uploads/`.
2. Si no existe, se descarga desde el proveedor correspondiente.
3. Las siguientes peticiones se sirven directamente desde el disco local.

## 📄 Licencia

Este proyecto es propiedad de **Fintech Innovation** y su uso está limitado a fines internos según los acuerdos de licencia de la organización.

