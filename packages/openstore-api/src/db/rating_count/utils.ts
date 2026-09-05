// SPDX-License-Identifier: AGPL-3.0-or-later
/* eslint-disable no-restricted-syntax */
import { type FilterQuery } from 'mongoose';

import { logger } from '../../utils';
import { Package } from '../package/model';
import { RATINGS, RATING_MAP } from '../review/constants';
import type { Ratings } from '../review/constants';
import { Review } from '../review/model';
import { type IReview } from '../review/types';
import { RatingCount } from './model';

export async function recalculatePackageRatings(pkgId: string) {
  const pkg = await Package.findOne({ id: pkgId });
  if (!pkg) {
    logger.error('Failed to recalculate ratings: could not find package');
    return null;
  }

  let calculatedRating = 0;

  const reviewQuery: FilterQuery<IReview> = { package_id: pkgId };
  const reviews = await Review.find(reviewQuery);

  const ratingCountsByIds = await RatingCount.getCountsByIds([pkgId]);
  const ratingCounts = ratingCountsByIds[pkgId] ?? [];

  for (const ratingName of RATINGS) {
    let count = 0;
    for (const rev of reviews) {
      if (rev.rating === ratingName) count++;
    }

    calculatedRating += RATING_MAP[ratingName as keyof typeof RATING_MAP] * count;

    let updatedCount = false;
    for (const ratingCount of ratingCounts) {
      if (ratingCount.name === ratingName) {
        ratingCount.count = count;
        ratingCount.package_id = pkgId;

        /* eslint-disable-next-line no-await-in-loop */
        await ratingCount.save();
        updatedCount = true;

        break;
      }
    }

    if (!updatedCount) {
      const ratingCount = new RatingCount();
      ratingCount.name = ratingName as Ratings;
      ratingCount.count = count;
      ratingCount.package_id = pkgId;

      /* eslint-disable-next-line no-await-in-loop */
      await ratingCount.save();

      pkg.rating_counts.push(ratingCount._id);
    }
  }

  // TODO only save the rating_counts & calculated_rating
  pkg.calculated_rating = calculatedRating;
  const savedPkg = await pkg.save();
  return savedPkg;
}
