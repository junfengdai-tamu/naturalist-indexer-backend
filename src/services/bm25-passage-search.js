import { searchPassagesByBm25 } from '../dao/database.js';
import { extractKeywords } from './keyword-extraction.js';

export async function searchPassagesByBm25Query(query) {
  const { keywords } = await extractKeywords(query);
  if (keywords.length === 0) return { query: query.trim(), keywords, results: [] };

  const results = await searchPassagesByBm25(keywords);
  return { query: query.trim(), keywords, results };
}
