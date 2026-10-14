const DEFAULT_API_BASE_URL = 'https://api.inaturalist.org/v1';

export async function searchObservations({ query, perPage = 10 }) {
  const baseUrl = (process.env.INATURALIST_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/observations`);
  url.search = new URLSearchParams({
    q: query,
    per_page: String(perPage),
    order_by: 'observed_on',
    order: 'desc',
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`iNaturalist API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  return {
    totalResults: payload.total_results ?? 0,
    observations: (payload.results ?? []).map((observation) => ({
      id: observation.id,
      species: observation.taxon?.name ?? observation.species_guess ?? null,
      commonName: observation.taxon?.preferred_common_name ?? null,
      observedOn: observation.observed_on ?? null,
      place: observation.place_guess ?? null,
      uri: observation.uri ?? `https://www.inaturalist.org/observations/${observation.id}`,
    })),
  };
}
