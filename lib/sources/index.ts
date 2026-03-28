export interface ChapterInfo {
  id: string;
  number: number;
  title: string;
  sourceId: string;
  sourceName: string;
  url: string;
  releaseDate?: Date;
  scanlator?: string;
}

export interface MangaSource {
  id: string;
  name: string;
  baseUrl: string;
  icon: string;
  
  search(query: string): Promise<SearchResult[]>;
  getMangaDetails(mangaId: string): Promise<MangaDetails>;
  getChapterList(mangaId: string): Promise<ChapterInfo[]>;
  getChapterPages(chapterId: string): Promise<string[]>;
}

export interface SearchResult {
  id: string;
  title: string;
  coverUrl: string;
  sourceId: string;
  url: string;
}

export interface MangaDetails {
  id: string;
  title: string;
  alternativeTitles: string[];
  description: string;
  coverUrl: string;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  genres: string[];
  authors: string[];
  artists: string[];
  sourceId: string;
}

// Source registry
const sources: Map<string, MangaSource> = new Map();

export function registerSource(source: MangaSource): void {
  sources.set(source.id, source);
}

export function getSource(id: string): MangaSource | undefined {
  return sources.get(id);
}

export function getAllSources(): MangaSource[] {
  return Array.from(sources.values());
}

export async function searchAllSources(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled(
    getAllSources().map(source => source.search(query))
  );
  
  return results
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

export async function findAlternativeSources(
  title: string,
  currentSourceId: string
): Promise<SearchResult[]> {
  const otherSources = getAllSources().filter(s => s.id !== currentSourceId);
  
  const results = await Promise.allSettled(
    otherSources.map(source => source.search(title))
  );
  
  return results
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => {
      // Sort by title similarity
      const titleLower = title.toLowerCase();
      const aScore = similarity(a.title.toLowerCase(), titleLower);
      const bScore = similarity(b.title.toLowerCase(), titleLower);
      return bScore - aScore;
    });
}

// Simple string similarity function using Levenshtein distance
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  
  return costs[s2.length];
}