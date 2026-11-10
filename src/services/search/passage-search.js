import { searchPassagesByEmbedding } from '../../dao/database.js';
import { getEmbeddingModel } from '../util/embeddings.js';
import { buildSearchResponse, normalizeQuery, parseGenerate } from '../util/search-response.js';

const SEARCH_MODEL = 'minilm';

export async function searchPassages(query, generate) {
  const normalizedQuery = normalizeQuery(query);
  const shouldGenerate = parseGenerate(generate);

  const model = await getEmbeddingModel(SEARCH_MODEL);
  const [embedding] = await model.embed([normalizedQuery]);
  const rows = await searchPassagesByEmbedding(embedding, model.id, model.dimensions);
  const passages = rows.map(({ similarity, ...passage }) => ({ ...passage, score: similarity }));

  return buildSearchResponse({
    query: normalizedQuery,
    retriever: 'embedding',
    scoreType: 'cosine_similarity',
    passages,
    generate: shouldGenerate,
    details: { model: model.id },
  });
}
