import { PackageSearch as ElasticsearchPackageSearch } from '../db/package/search';

const elasticsearchSearch = new ElasticsearchPackageSearch();

elasticsearchSearch.removeIndex().then(() => {
  console.log('done');
  process.exit(0);
}).catch((err: Error) => {
  console.log(err);
  process.exit(1);
});
