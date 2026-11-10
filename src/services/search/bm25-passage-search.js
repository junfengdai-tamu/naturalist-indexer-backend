import { searchPassagesByBm25 } from '../../dao/database.js';
import { extractKeywords } from '../util/keyword-extraction.js';
import { buildSearchResponse, normalizeQuery, parseGenerate } from '../util/search-response.js';

export async function searchPassagesByBm25Query(query, generate) {
  const normalizedQuery = normalizeQuery(query);
  const shouldGenerate = parseGenerate(generate);

  const { keywords } = await extractKeywords(normalizedQuery);
  const rows = keywords.length === 0 ? [] : await searchPassagesByBm25(keywords);
  const passages = rows.map(({ bm25_score, ...passage }) => ({ ...passage, score: bm25_score }));

  return buildSearchResponse({
    query: normalizedQuery,
    retriever: 'bm25',
    scoreType: 'bm25',
    passages,
    generate: shouldGenerate,
    details: { keywords },
  });
}
