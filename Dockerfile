FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /home/node/.cache/huggingface/transformers \
    && chown -R node:node /home/node/.cache

USER node
EXPOSE 3000

CMD ["node", "src/index.js"]
