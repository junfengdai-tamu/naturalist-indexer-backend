import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const INAT = 'https://api.inaturalist.org/v1';
const GBIF = 'https://api.gbif.org/v1';
const CACHE_DIR = 'data/raw';
const OUT_FILE = 'data/passages.csv';
const MAX_PASSAGE_CHARS = 500;

const MAX_PASSAGES_PER_SPECIES = 12;
const MAX_PASSAGES_PER_SECTION = 2;
const DROP_SECTIONS = new Set([
  'references', 'external links', 'see also', 'further reading', 'notes', 'bibliography',
  'sources', 'citations', 'taxonomy', 'etymology', 'subspecies', 'synonyms', 'evolution',
  'history', 'in captivity', 'in culture', 'gallery', 'footnotes',
]);

async function cachedGet(url, delayMs) {
  const file = path.join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'naturalist-indexer-backend/1.0 (course project; yushantang@tamu.edu)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const body = await response.json();
  await writeFile(file, JSON.stringify(body));
  return body;
}

const inat = (route, params) => cachedGet(`${INAT}${route}?${new URLSearchParams(params)}`, 1000);
const gbif = (route, params) => cachedGet(`${GBIF}${route}?${new URLSearchParams(params)}`, 100);

async function findTexasPlaceId() {
  const { results } = await inat('/places/autocomplete', { q: 'Texas' });
  const texas = results.find((p) => p.name === 'Texas' && p.admin_level === 1) ?? results[0];
  if (!texas) throw new Error('Could not resolve Texas place_id');
  return texas.id;
}

async function fetchSpeciesCounts(placeId) {
  const species = [];
  for (let page = 1; ; page++) {
    const body = await inat('/observations/species_counts', {
      place_id: placeId,
      iconic_taxa: 'Reptilia,Amphibia',
      rank: 'species',
      per_page: '500',
      page: String(page),
    });
    species.push(...body.results);
    if (species.length >= body.total_results || body.results.length === 0) return species;
  }
}

async function fetchTaxa(ids) {
  const taxa = new Map();
  for (let i = 0; i < ids.length; i += 30) {
    const body = await inat(`/taxa/${ids.slice(i, i + 30).join(',')}`, { all_names: 'true' });
    for (const taxon of body.results) taxa.set(taxon.id, taxon);
  }
  return taxa;
}

async function fetchGbifNames(scientificName) {
  try {
    const match = await gbif('/species/match', { name: scientificName, kingdom: 'Animalia' });
    if (!match.usageKey) return [];
    const { results } = await gbif(`/species/${match.usageKey}/vernacularNames`, { limit: '100' });
    return results.filter((r) => r.language === 'eng').map((r) => r.vernacularName);
  } catch (error) {
    console.warn(`GBIF lookup failed for ${scientificName}: ${error.message}`);
    return [];
  }
}

async function fetchWikipediaSections(wikipediaUrl) {
  const slug = wikipediaUrl?.match(/\/wiki\/([^?#]+)/)?.[1];
  if (!slug) return null;
  try {
    const title = decodeURIComponent(slug).replaceAll('_', ' ');
    const body = await cachedGet(
      `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
        action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', format: 'json', titles: title,
      })}`,
      200,
    );
    const text = Object.values(body.query?.pages ?? {})[0]?.extract;
    if (!text) return null;

    const sections = [];
    let heading = '';
    let dropping = false;
    let lines = [];
    const flush = () => {
      const content = cleanText(lines.join(' '));
      if (!dropping && content) sections.push({ heading, content });
      lines = [];
    };
    for (const line of text.split('\n')) {
      const match = line.match(/^=+\s*(.+?)\s*=+$/);
      if (match) {
        flush();
        heading = match[1];
        dropping = DROP_SECTIONS.has(heading.toLowerCase());
      } else {
        lines.push(line);
      }
    }
    flush();
    return sections;
  } catch (error) {
    console.warn(`Wikipedia fetch failed for ${wikipediaUrl}: ${error.message}`);
    return null;
  }
}

const cleanText = (text) =>
  text
    .replace(/\(\s*listen\s*\)/g, '')
    .replace(/\([^()]*\/[^()]*\/[^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;)])/g, '$1')
    .trim();

const stripHtml = (text) =>
  cleanText((text ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'));

function splitPassages(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const passages = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > MAX_PASSAGE_CHARS) {
      passages.push(current);
      current = '';
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) passages.push(current);
  return passages;
}

function csvRow(values) {
  return values.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',');
}

function englishNames(taxon, gbifNames) {
  const fromInat = (taxon.names ?? []).filter((n) => n.locale === 'en').map((n) => n.name);
  const seen = new Set();
  return [taxon.preferred_common_name, ...fromInat, ...gbifNames].filter((name) => {
    const key = name?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

await mkdir(CACHE_DIR, { recursive: true });

const placeId = await findTexasPlaceId();
const counts = await fetchSpeciesCounts(placeId);
console.log(`Texas place_id=${placeId}, ${counts.length} species`);

const taxa = await fetchTaxa(counts.map((c) => c.taxon.id));

const rows = [csvRow([
  'passage_id', 'taxon_id', 'scientific_name', 'common_name', 'class', 'family',
  'observation_count', 'passage_index', 'source', 'text',
])];

const minObservations = Number(process.env.MIN_OBSERVATIONS ?? 1);

for (const { count, taxon: stub } of counts) {
  if (count < minObservations) continue;
  const taxon = taxa.get(stub.id) ?? stub;
  const names = englishNames(taxon, await fetchGbifNames(taxon.name));
  const rank = (r) => (taxon.ancestors ?? []).find((a) => a.rank === r)?.name ?? '';
  const commonName = names[0] ?? '';

  const header = `${commonName ? `${commonName} (${taxon.name})` : taxon.name}.`;
  const facts = [
    rank('family') && `Family: ${rank('family')}.`,
    names.length > 1 && `Also called: ${names.slice(1).join(', ')}.`,
    taxon.conservation_status?.status_name && `Conservation status: ${taxon.conservation_status.status_name}.`,
  ].filter(Boolean);
  const summary = stripHtml(taxon.wikipedia_summary);
  const wikiSections = await fetchWikipediaSections(taxon.wikipedia_url);
  const source = wikiSections?.length ? 'wikipedia_full' : summary ? 'wikipedia_summary' : 'none';
  const sections = wikiSections?.length ? wikiSections : [{ heading: '', content: summary }];

  const passages = [facts.join(' ')];
  for (const { heading, content } of sections) {
    const parts = splitPassages(content).slice(0, MAX_PASSAGES_PER_SECTION);
    if (heading && parts.length) parts[0] = `${heading}: ${parts[0]}`;
    passages.push(...parts);
  }
  const kept = passages.filter(Boolean).slice(0, MAX_PASSAGES_PER_SPECIES);
  if (kept.length === 0) kept.push('');
  kept.forEach((body, i) => {
    rows.push(csvRow([
      `${taxon.id}-${i}`, taxon.id, taxon.name, commonName, rank('class'), rank('family'),
      count, i, source, `${header} ${body}`.trim(),
    ]));
  });
}

await writeFile(OUT_FILE, `${rows.join('\n')}\n`);
console.log(`Wrote ${rows.length - 1} passages to ${OUT_FILE}`);
