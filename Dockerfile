# Etapa 1: Construcción (Aislamos el NPM_TOKEN y herramientas de build)
FROM node:22-slim AS builder

ARG NPM_TOKEN
WORKDIR /app

COPY package*.json ./
# Generamos .npmrc solo para el install
RUN echo "@fintechinnovaciondev:registry=https://npm.pkg.github.com/" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm install && \
    rm .npmrc

COPY . .
RUN npm run build
# Limpiamos node_modules para que solo queden los de producción
RUN npm prune --production

# Etapa 2: Ejecución (Imagen final limpia y funcional)
FROM node:22-slim

# Instalamos dependencias de sistema una sola vez
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    python3 \
    python3-pip \
    python3-setuptools \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Instalamos PaddleOCR (Es lo que más tarda y pesa)
RUN pip3 install paddleocr paddlepaddle --break-system-packages

WORKDIR /app

# Solo copiamos lo estrictamente necesario para correr la app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/uploads ./uploads

# Preparamos directorios para PaddleOCR, PaddleX y logs
RUN mkdir -p /home/node/.paddleocr /home/node/.paddlex && chown -R node:node /home/node/.paddleocr /home/node/.paddlex
RUN mkdir -p logs && chown -R node:node logs /app

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]