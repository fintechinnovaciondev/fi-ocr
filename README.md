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

| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `STORAGE_TYPE` | Estrategia de almacenamiento activa | `local`, `gcs`, `oci` |
| `OLLAMA_URL` | URL del servidor de Ollama para LLM | `http://host.docker.internal:11434/api/generate` |
| `LOGGING_LEVEL_CONSOLE` | Nivel de logs para consola | `info`, `debug`, `error` |
| `MONGO_URI` | Cadena de conexión a MongoDB | `mongodb://localhost/ocr` |
| `REDIS_HOST` | Host de servidor Redis | `localhost` |

## 📦 Sistema de Cache de Imágenes

Para optimizar el rendimiento de la interfaz, el sistema implementa una **cache local de imágenes**. Cuando se solicita la imagen de un proceso almacenado en la nube (GCS/OCI):
1. El sistema verifica si el archivo ya existe en la carpeta `uploads/`.
2. Si no existe, se descarga desde el proveedor correspondiente.
3. Las siguientes peticiones se sirven directamente desde el disco local.

## 📄 Licencia

Este proyecto es propiedad de **Fintech Innovation** y su uso está limitado a fines internos según los acuerdos de licencia de la organización.

