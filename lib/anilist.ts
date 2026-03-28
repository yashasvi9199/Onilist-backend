import axios from 'axios';

const ANILIST_API = 'https://graphql.anilist.co';

export interface AniListManga {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  description: string | null;
  coverImage: {
    extraLarge: string;
    large: string;
    medium: string;
    color: string | null;
  };
  bannerImage: string | null;
  chapters: number | null;
  volumes: number | null;
  status: string;
  averageScore: number | null;
  meanScore: number | null;
  popularity: number;
  genres: string[];
  tags: Array<{
    id: number;
    name: string;
    rank: number;
    isMediaSpoiler: boolean;
  }>;
  countryOfOrigin: string;
  isAdult: boolean;
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  endDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
}

export interface SearchFilters {
  query?: string;
  minChapters?: number;
  genres?: string[];
  tags?: string[];
  status?: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  countryOfOrigin?: 'KR' | 'JP' | 'CN';
  sort?: string[];
  page?: number;
  perPage?: number;
}

export class AniListClient {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async query<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await axios.post(
      ANILIST_API,
      { query, variables },
      { headers }
    );

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    return response.data.data;
  }

  async searchManga(filters: SearchFilters): Promise<{
    pageInfo: { total: number; currentPage: number; hasNextPage: boolean };
    media: AniListManga[];
  }> {
    const searchQuery = `
      query (
        $page: Int,
        $perPage: Int,
        $search: String,
        $chapters_greater: Int,
        $genre_in: [String],
        $tag_in: [String],
        $status: MediaStatus,
        $countryOfOrigin: CountryCode,
        $sort: [MediaSort]
      ) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            currentPage
            hasNextPage
          }
          media(
            type: MANGA,
            search: $search,
            chapters_greater: $chapters_greater,
            genre_in: $genre_in,
            tag_in: $tag_in,
            status: $status,
            countryOfOrigin: $countryOfOrigin,
            sort: $sort
          ) {
            id
            title {
              romaji
              english
              native
            }
            description(asHtml: false)
            coverImage {
              extraLarge
              large
              medium
              color
            }
            bannerImage
            chapters
            volumes
            status
            averageScore
            meanScore
            popularity
            genres
            tags {
              id
              name
              rank
              isMediaSpoiler
            }
            countryOfOrigin
            isAdult
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
          }
        }
      }
    `;

    const variables = {
      page: filters.page || 1,
      perPage: filters.perPage || 20,
      search: filters.query || undefined,
      chapters_greater: filters.minChapters ? filters.minChapters - 1 : undefined,
      genre_in: filters.genres?.length ? filters.genres : undefined,
      tag_in: filters.tags?.length ? filters.tags : undefined,
      status: filters.status || undefined,
      countryOfOrigin: filters.countryOfOrigin || undefined,
      sort: filters.sort || ['POPULARITY_DESC'],
    };

    const result = await this.query<{ Page: any }>(searchQuery, variables);
    return result.Page;
  }

  async getMangaById(id: number): Promise<AniListManga> {
    const detailQuery = `
      query ($id: Int) {
        Media(id: $id, type: MANGA) {
          id
          title {
            romaji
            english
            native
          }
          description(asHtml: false)
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          chapters
          volumes
          status
          averageScore
          meanScore
          popularity
          genres
          tags {
            id
            name
            rank
            isMediaSpoiler
          }
          countryOfOrigin
          isAdult
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
        }
      }
    `;

    const result = await this.query<{ Media: AniListManga }>(detailQuery, { id });
    return result.Media;
  }

  async getLongFormManhwa(page: number = 1): Promise<{
    pageInfo: any;
    media: AniListManga[];
  }> {
    return this.searchManga({
      minChapters: 200,
      countryOfOrigin: 'KR',
      sort: ['CHAPTERS_DESC', 'POPULARITY_DESC'],
      page,
      perPage: 20,
    });
  }

  async getRecommendationsByTags(mangaId: number, minChapters: number = 50): Promise<AniListManga[]> {
    const manga = await this.getMangaById(mangaId);
    
    const topTags = manga.tags
      .filter(t => !t.isMediaSpoiler)
      .slice(0, 3)
      .map(t => t.name);

    if (topTags.length === 0) {
      return [];
    }

    const result = await this.searchManga({
      tags: topTags,
      minChapters,
      sort: ['POPULARITY_DESC'],
      perPage: 10,
    });

    return result.media.filter(m => m.id !== mangaId);
  }
}

export const anilistClient = new AniListClient();