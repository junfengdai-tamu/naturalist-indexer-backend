import { groqError, groqJsonCompletion } from './groq-client.js';

export async function answerFromPassages(query, passages) {
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

  const result = await groqJsonCompletion({ messages, temperature: 0.2, maxCompletionTokens: 2048 });
  if (typeof result?.answer !== 'string' || !Array.isArray(result.ranked_passage_ids)) {
    console.error('Groq response is missing answer or ranked_passage_ids');
    throw groqError('Groq returned an invalid response', 502);
  }
  const availableIds = new Set(passages.map((passage) => String(passage.passage_id)));
  return {
    answer: result.answer,
    rankedPassageIds: [...new Set(result.ranked_passage_ids.map(String))]
      .filter((id) => availableIds.has(id)),
  };
}
