import { MeiliSearch, type SearchParams } from 'meilisearch';

import { config, logger } from '../../utils';
import type { PackageSearchInterface } from './search-interface';
import { type HydratedPackage, type IPackage, type PackageRequestFilters } from './types';

// Properties to index for search
const PROPERTIES: (keyof IPackage)[] = [
  'id',
  'name',
  'architectures',
  'author',
  'category',
  'channels',
  'channel_architectures',
  'device_compatibilities',
  'description',
  'icon',
  'keywords',
  'license',
  'nsfw',
  'published_date',
  'tagline',
  'types',
  'updated_date',
  'calculated_rating',
  'package_type',
];

const SEARCH_FIELDS = [
  'search_name',
  'tagline',
  'keywords',
  'description',
  //  'author',
];

function sanitizeId(id: string): string {
  return id.replace(/\./g, '___');
}

export class PackageSearch implements PackageSearchInterface {
  private readonly client: MeiliSearch;
  private readonly indexName: string;

  constructor() {
    this.client = new MeiliSearch({
      host: config.meilisearch.uri,
      apiKey: config.meilisearch.apiKey,
    });
    this.indexName = `${config.meilisearch.indexPrefix}packages`;
  }

  convert(item: HydratedPackage): Record<string, any> {
    const doc: Partial<IPackage> & { search_name?: string; originalId?: string; rating_bucket?: number; snap_data_channels?: string[] } =
      {};

    // Store the original ID for reference
    doc.originalId = item.id;
    // Create a sanitized ID that Meilisearch will accept (replacing dots with underscores)
    const sanitizedId = sanitizeId(item.id);

    for (const prop of PROPERTIES) {
      if (prop === 'id') {
        doc[prop] = sanitizedId;
      } else {
        (doc as any)[prop] = item[prop] ? item[prop] : null;
      }
    }

    doc.search_name = item.name;
    doc.snap_data_channels = item.snap_data?.channels ?? [];
    doc.category = doc.category ? doc.category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase() : '';
    doc.nsfw = !!doc.nsfw; // Force a boolean

    if (doc.keywords) {
      doc.keywords = doc.keywords.map((keyword: string) => keyword.toLowerCase().trim()).filter(Boolean);
    } else {
      doc.keywords = [];
    }

    /*
      Map calculated_rating -> rating_bucket using logarithmic buckets (25 -> 1, 50 -> 2, 100 -> 3, etc.).
      For relevant searching, this gives a boost to higher rated packages without over-prioritizing small differences in rating.
    */
    const rating = item.calculated_rating ?? 0;
    doc.rating_bucket = 0;
    if (rating > 0) {
      doc.rating_bucket = Math.max(0, Math.floor(Math.log2(rating / 25)) + 1);
    }

    return doc;
  }

  async upsert(item: HydratedPackage): Promise<HydratedPackage> {
    const document = this.convert(item);
    await this.client.index(this.indexName).addDocuments([document], { primaryKey: 'id' });
    return item;
  }

  async remove(item: HydratedPackage): Promise<HydratedPackage> {
    try {
      const sanitizedId = sanitizeId(item.id);
      await this.client.index(this.indexName).deleteDocument(sanitizedId);
    } catch (err) {
      // Handle cases where document doesn't exist
      if (err instanceof Error && err.message !== 'document_not_found') {
        throw err;
      }
    }
    return item;
  }

  async bulk(upserts: HydratedPackage[], removals?: HydratedPackage[]): Promise<any> {
    if (upserts.length > 0) {
      const documents = upserts.map((item) => this.convert(item));
      await this.client.index(this.indexName).addDocuments(documents, { primaryKey: 'id' });
    }

    if (removals && removals.length > 0) {
      const ids = removals.map((item) => sanitizeId(item.id));
      await this.client.index(this.indexName).deleteDocuments(ids);
    }

    return { success: true };
  }

  parseFilters({ types, ids, packageTypes, frameworks, architectures, category, author, channel, nsfw }: PackageRequestFilters): string[] {
    const filters: string[] = [];

    if (types && types.length > 0) {
      filters.push(`types IN ["${types.join('","')}"]`);
    }

    if (packageTypes && packageTypes.length > 0) {
      filters.push(`package_type IN ["${packageTypes.join('","')}"]`);
    }

    if (ids && ids.length > 0) {
      const sanitizedIds = ids.map((id) => sanitizeId(id));
      filters.push(`id IN ["${sanitizedIds.join('","')}"]`);
    }

    if (architectures && architectures.length > 0 && channel && frameworks) {
      const frameworksArray = Array.isArray(frameworks) ? frameworks : [frameworks];

      const deviceCompats = architectures.flatMap((arch: string) =>
        frameworksArray.map((framework: string) => `${String(channel)}:${String(arch)}:${String(framework)}`),
      );

      filters.push(`device_compatibilities IN ["${deviceCompats.join('","')}"]`);
    } else if (architectures && architectures.length > 0 && channel) {
      const channelArchs = architectures.map((arch) => `${channel}:${arch}`);
      filters.push(`channel_architectures IN ["${channelArchs.join('","')}"]`);
    } else if (channel) {
      filters.push(`channels IN ["${channel}"]`);
    }

    if (category) {
      filters.push(`category = "${category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase()}"`);
    }

    if (author) {
      filters.push(`author = "${author}"`);
    }

    if (nsfw && nsfw.length > 0) {
      filters.push(`nsfw = ${String(nsfw.includes(true))}`);
    }

    // Only include snaps that have a stable channel
    filters.push(`package_type != snap OR snap_data_channels = "stable"`);

    return filters;
  }

  async search(filters: PackageRequestFilters, sort: string = 'relevance', skip: number = 0, limit: number = 30) {
    const searchParams: SearchParams = {
      offset: skip,
      limit,
      attributesToRetrieve: ['*'],

      // For debugging ranking
      // showRankingScore: true,
      // showRankingScoreDetails: true,
    };

    if (sort) {
      let sortField = sort;
      let sortDirection: 'asc' | 'desc' = 'asc';
      if (sort === 'relevance') {
        sortField = 'rating_bucket';
        sortDirection = 'desc';
      }

      if (sort.charAt(0) === '-') {
        sortDirection = 'desc';
        sortField = sort.substring(1);
      }

      searchParams.sort = [`${sortField}:${sortDirection}`];
    }

    const filterQueries = this.parseFilters(filters);
    if (filterQueries.length > 0) {
      searchParams.filter = filterQueries;
    }

    logger.debug(`Meilisearch search query: ${JSON.stringify(searchParams)}`);

    const results = await this.client.index(this.indexName).search(filters.search || '', searchParams);

    // Map back the sanitized IDs to the original IDs
    if (results.hits.length > 0) {
      results.hits = results.hits.map((hit) => {
        if (hit.originalId) {
          hit.id = hit.originalId;
        }
        return hit;
      });
    }

    return {
      hits: results.hits,
      count: results.estimatedTotalHits ?? results.hits.length,
    };
  }

  async removeIndex(): Promise<any> {
    try {
      const result = await this.client.deleteIndex(this.indexName);
      return result;
    } catch (error) {
      // If index doesn't exist, that's fine
      if (error instanceof Error && !error.message.includes('not_found')) {
        throw error;
      }

      return { deleted: true };
    }
  }

  async createIndex(): Promise<any> {
    await this.client.createIndex(this.indexName, { primaryKey: 'id' });

    logger.debug('Creating index with searchable fields:', SEARCH_FIELDS);

    await this.client.index(this.indexName).updateSettings({
      searchableAttributes: SEARCH_FIELDS,
      filterableAttributes: [
        'category',
        'types',
        'architectures',
        'channels',
        'framework',
        'nsfw',
        'author',
        'id',
        'channel_architectures',
        'device_compatibilities',
        'package_type',
        'snap_data_channels',
      ],
      sortableAttributes: ['name', 'updated_date', 'published_date', 'calculated_rating', 'rating_bucket'],
      rankingRules: ['words', 'typo', 'proximity', 'sort', 'attribute', 'exactness'],
    });

    return { created: true };
  }
}
