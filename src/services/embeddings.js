import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const modelDefinitions = {
  minilm: {
    id: 'sentence-transformers/all-MiniLM-L6-v2',
    provider: 'transformers.js',
    dimensions: 384,
    load: async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      const cacheDir = process.env.TRANSFORMERS_CACHE
        || path.join(process.env.HOME || process.cwd(), '.cache', 'huggingface', 'transformers');
      await mkdir(cacheDir, { recursive: true });
      env.cacheDir = cacheDir;
      return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    },
    options: { pooling: 'mean', normalize: true },
  },
};

const loadedModels = new Map();

export function listEmbeddingModels() {
  return Object.entries(modelDefinitions).map(([key, { id, provider, dimensions }]) => ({
    key,
    id,
    provider,
    dimensions,
  }));
}

export async function getEmbeddingModel(key) {
  const definition = modelDefinitions[key];
  if (!definition) {
    throw new Error(`Unknown embedding model "${key}". Available models: ${Object.keys(modelDefinitions).join(', ')}`);
  }

  if (!loadedModels.has(key)) {
    const loading = definition.load().then((runner) => ({ definition, runner }));
    loadedModels.set(key, loading);
  }

  const { runner } = await loadedModels.get(key);
  return {
    id: definition.id,
    dimensions: definition.dimensions,
    async embed(texts) {
      if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string' || text.length === 0)) {
        throw new TypeError('Embedding input must be an array of non-empty strings');
      }
      const output = await runner(texts, definition.options);
      const expectedLength = texts.length * definition.dimensions;
      if (output.data.length !== expectedLength) {
        throw new Error(`${definition.id} returned ${output.data.length} values; expected ${expectedLength}`);
      }
      return Array.from({ length: texts.length }, (_, index) =>
        Array.from(output.data.subarray(index * definition.dimensions, (index + 1) * definition.dimensions)));
    },
  };
}

export async function disposeEmbeddingModels() {
  const models = await Promise.allSettled(loadedModels.values());
  loadedModels.clear();
  await Promise.all(models
    .filter((result) => result.status === 'fulfilled')
    .map(({ value }) => value.runner.dispose?.()));
}
