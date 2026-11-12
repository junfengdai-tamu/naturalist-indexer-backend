import { tamuError, tamuJsonCompletion } from "../llm/tamu-client.js";

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

async function answerFromPassages(query, passages) {
  const context = passages.map((passage, index) => ({
    passage_id: passage.passage_id,
    scientific_name: passage.scientific_name,
    common_name: passage.common_name,
    text: passage.text,
    search_rank: index + 1,
  }));

  const messages = [
    {
      role: 'system',
      content: 'You answer questions using only the supplied iNaturalist passages. Re-rank the passages by relevance to the original query, then answer clearly in the query language. Do not invent facts. If the passages do not contain enough information, say so. Return a JSON object with exactly two fields: "answer" (string) and "ranked_passage_ids" (array of passage_id values ordered from most to least relevant). Include each supplied passage_id exactly once.',
    },
    {
      role: 'user',
      content: JSON.stringify({ query, passages: context }),
    },
  ];

  const result = await tamuJsonCompletion({ messages });
  if (typeof result?.answer !== 'string' || !Array.isArray(result.ranked_passage_ids)) {
    console.error('TAMU AI response is missing answer or ranked_passage_ids');
    throw tamuError('TAMU AI returned an invalid response', 502);
  }
  const availableIds = new Set(passages.map((passage) => String(passage.passage_id)));
  return {
    answer: result.answer,
    rankedPassageIds: [...new Set(result.ranked_passage_ids.map(String))]
      .filter((id) => availableIds.has(id)),
  };
}