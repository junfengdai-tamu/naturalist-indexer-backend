import { searchPassagesByEmbedding } from '../dao/database.js';
import { getEmbeddingModel } from './embeddings.js';
import { answerFromPassages } from './groq.js';

const SEARCH_MODEL = 'minilm';
const MAX_QUERY_LENGTH = 2000;

export async function searchPassages(query) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    const error = new TypeError('query must be a non-empty string');
    error.statusCode = 400;
    throw error;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    const error = new RangeError(`query must be ${MAX_QUERY_LENGTH} characters or fewer`);
    error.statusCode = 400;
    throw error;
  }

  const normalizedQuery = query.trim();
  const model = await getEmbeddingModel(SEARCH_MODEL);
  const [embedding] = await model.embed([normalizedQuery]);
  const results = await searchPassagesByEmbedding(embedding, model.id, model.dimensions);
  const generated = await answerFromPassages(normalizedQuery, results);

  // Sources are all retrieved passages, ordered by the model's re-ranking; any it omitted keep their similarity order.
  const rankedIds = new Set(generated.rankedPassageIds);
  const byId = new Map(results.map((passage) => [String(passage.passage_id), passage]));
  const sources = [
    ...generated.rankedPassageIds.map((id) => byId.get(id)),
    ...results.filter((passage) => !rankedIds.has(String(passage.passage_id))),
  ];

  return { query: normalizedQuery, model: model.id, answer: generated.answer, sources };
}
