import { answerFromPassages } from './groq.js';

const MAX_QUERY_LENGTH = 2000;

function badRequest(error) {
  error.statusCode = 400;
  return error;
}

export function normalizeQuery(query) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw badRequest(new TypeError('query must be a non-empty string'));
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw badRequest(new RangeError(`query must be ${MAX_QUERY_LENGTH} characters or fewer`));
  }
  return query.trim();
}

// `generate` is optional and defaults to true; false skips the LLM re-rank and answer.
export function parseGenerate(generate) {
  if (generate === undefined) return true;
  if (typeof generate !== 'boolean') throw badRequest(new TypeError('generate must be a boolean'));
  return generate;
}

// Shared response for every retriever: the same shape and the same optional LLM step,
// so results from different retrievers can be compared directly.
export async function buildSearchResponse({ query, retriever, scoreType, passages, generate, details = {} }) {
  const retrieved = passages.map((passage, index) => ({ ...passage, retrieval_rank: index + 1 }));
  const response = { query, retriever, score_type: scoreType, ...details };

  if (!generate || retrieved.length === 0) {
    return { ...response, answer: null, sources: retrieved };
  }

  const generated = await answerFromPassages(query, retrieved);
  // Sources follow the model's re-ranking; any it omitted keep their retrieval order.
  const rankedIds = new Set(generated.rankedPassageIds);
  const byId = new Map(retrieved.map((passage) => [String(passage.passage_id), passage]));
  const sources = [
    ...generated.rankedPassageIds.map((id) => byId.get(id)),
    ...retrieved.filter((passage) => !rankedIds.has(String(passage.passage_id))),
  ];
  return { ...response, answer: generated.answer, sources };
}
