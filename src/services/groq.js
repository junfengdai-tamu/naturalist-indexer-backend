const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export async function answerFromPassages(query, passages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const error = new Error('GROQ_API_KEY is not configured');
    error.statusCode = 503;
    throw error;
  }

  const context = passages.map((passage, index) => ({
    passage_id: passage.passage_id,
    scientific_name: passage.scientific_name,
    common_name: passage.common_name,
    text: passage.text,
    similarity: passage.similarity,
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

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: 2048,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    const error = new Error('Could not reach Groq API', { cause });
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Groq API returned ${response.status}: ${errorBody}`);
    const error = new Error('Groq API request failed');
    error.statusCode = 502;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    const result = JSON.parse(content);
    if (typeof result.answer !== 'string' || !Array.isArray(result.ranked_passage_ids)) {
      throw new TypeError('Groq response is missing answer or ranked_passage_ids');
    }
    const availableIds = new Set(passages.map((passage) => String(passage.passage_id)));
    return {
      answer: result.answer,
      rankedPassageIds: [...new Set(result.ranked_passage_ids.map(String))]
        .filter((id) => availableIds.has(id)),
    };
  } catch (cause) {
    console.error('Could not parse Groq response:', cause);
    const error = new Error('Groq returned an invalid response');
    error.statusCode = 502;
    throw error;
  }
}
