import { MeiliSearch } from 'meilisearch';
import { config, logger } from '../../utils';
import { type HydratedPackage, type IPackage, type PackageRequestFilters } from './types';
import type { PackageSearchInterface } from './search-interface';

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
];

const SEARCH_FIELDS = [
  'search_name',
  'name',
  'description',
  'keywords',
  'author',
  'tagline',
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
    const doc: Partial<IPackage> & { search_name?: string; originalId?: string } = {};

    // Store the original ID for reference
    doc.originalId = item.id;
    // Create a sanitized ID that Meilisearch will accept (replacing dots with underscores)
    const sanitizedId = sanitizeId(item.id);

    for (const prop of PROPERTIES) {
      if (prop === 'id') {
        doc[prop] = sanitizedId;
      }
      else {
        (doc as any)[prop] = item[prop] ? item[prop] : null;
      }
    }

    doc.search_name = item.name;
    doc.category = doc.category ? doc.category.replace(/&/g, '_').replace(/ /g, '_').toLowerCase() : '';
    doc.nsfw = !!doc.nsfw; // Force a boolean

    if (doc.keywords) {
      doc.keywords = doc.keywords.map((keyword: string) => keyword.toLowerCase().trim()).filter(Boolean);
    }
    else {
      doc.keywords = [];
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
    }
    catch (err) {
      // Handle cases where document doesn't exist
      if (err instanceof Error && err.message !== 'document_not_found') {
        throw err;
      }
    }
    return item;
  }

  async bulk(upserts: HydratedPackage[], removals?: HydratedPackage[]): Promise<any> {
    if (upserts.length > 0) {
      const documents = upserts.map(item => this.convert(item));
      await this.client.index(this.indexName).addDocuments(documents, { primaryKey: 'id' });
    }

    if (removals && removals.length > 0) {
      const ids = removals.map(item => sanitizeId(item.id));
      await this.client.index(this.indexName).deleteDocuments(ids);
    }

    return { success: true };
  }

  parseFilters({ types, ids, frameworks, architectures, category, author, channel, nsfw }: PackageRequestFilters): string[] {
    const filters: string[] = [];

    if (types && types.length > 0) {
      filters.push(`types IN ["${types.join('","')}"]`);
    }

    if (ids && ids.length > 0) {
      const sanitizedIds = ids.map(id => sanitizeId(id));
      filters.push(`id IN ["${sanitizedIds.join('","')}"]`);
    }

    if (architectures && architectures.length > 0 && channel && frameworks) {
      const frameworksArray = Array.isArray(frameworks) ? frameworks : [frameworks];

      const deviceCompats = architectures.flatMap((arch: string) =>
        frameworksArray.map((framework: string) => `${String(channel)}:${String(arch)}:${String(framework)}`),
      );

      filters.push(`device_compatibilities IN ["${deviceCompats.join('","')}"]`);
    }
    else if (architectures && architectures.length > 0 && channel) {
      const channelArchs = architectures.map(arch => `${channel}:${arch}`);
      filters.push(`channel_architectures IN ["${channelArchs.join('","')}"]`);
    }
    else if (channel) {
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

    return filters;
  }

  async search(filters: PackageRequestFilters, sort: string = 'relevance', skip: number = 0, limit: number = 30) {
    const searchParams: any = {
      offset: skip,
      limit,
      attributesToRetrieve: ['*'],
    };

    if (sort && sort !== 'relevance') {
      let sortField = sort;
      let sortDirection: 'asc' | 'desc' = 'asc';

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

    logger.debug('Meilisearch search query:', filters.search || '', 'with params:', JSON.stringify(searchParams, null, 2));

    const results = await this.client.index(this.indexName).search(filters.search || '', searchParams);

    // Map back the sanitized IDs to the original IDs
    if (results.hits && results.hits.length > 0) {
      results.hits = results.hits.map(hit => {
        if (hit.originalId) {
          hit.id = hit.originalId;
        }
        return hit;
      });
    }

    return results;
  }

  async removeIndex(): Promise<any> {
    try {
      const result = await this.client.deleteIndex(this.indexName);
      return result;
    }
    catch (error) {
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
      ],
      sortableAttributes: [
        'name',
        'updated_date',
        'published_date',
        'calculated_rating',
      ],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
      ],
    });

    return { created: true };
  }
}
