import 'db'; // Make sure the database connection gets setup
import { type HydratedPackage, Package } from '../db/package';
import { recalculatePackageRatings } from '../db/rating_count/utils';
import { PackageSearch as ElasticsearchPackageSearch } from '../db/package/search';

const elasticsearchSearch = new ElasticsearchPackageSearch();

Package.find({ published: true }).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    return recalculatePackageRatings(pkg._id);
  }));
}).then((pkgs) => {
  return elasticsearchSearch.bulk(pkgs.filter((pkg): pkg is HydratedPackage => !!pkg));
}).then(() => {
  console.log('done');
  process.exit(0);
})
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
