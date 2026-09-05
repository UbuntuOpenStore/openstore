// SPDX-License-Identifier: AGPL-3.0-or-later
/* eslint-disable no-param-reassign */

import { type Request } from 'express';
import { type FilterQuery, type Schema } from 'mongoose';

import { UserError } from '../../exceptions';
import { getDataInt } from '../../utils';
import { REVIEW_REDACTED } from '../../utils/error-messages';
import { type HydratedPackage } from '../package/types';
import { type HydratedUser } from '../user/types';
import { type Ratings } from './constants';
import { type HydratedReview, type IReview, type IReviewMethods, type ReviewModel, type ReviewRequestFilters } from './types';

export function setupStatics(reviewSchema: Schema<IReview, ReviewModel, IReviewMethods>) {
  reviewSchema.statics.createOrUpdateExisting = async function (
    pkg: HydratedPackage,
    user: HydratedUser,
    version: string,
    rating: Ratings,
    body?: string,
  ): Promise<HydratedReview> {
    let ownReview = await this.findOne({ package_id: pkg.id, user: user._id });
    if (!ownReview) {
      ownReview = new this();
      ownReview.pkg = pkg._id;
      ownReview.user = user._id;
      ownReview.redacted = false;
    }

    ownReview.package_id = pkg.id;

    if (ownReview.redacted) {
      throw new UserError(REVIEW_REDACTED);
    }

    ownReview.body = body;
    ownReview.rating = rating;
    ownReview.version = version;
    ownReview.date = new Date();
    ownReview = await ownReview.save();

    return ownReview;
  };

  reviewSchema.statics.parseRequestFilters = function (req: Request): ReviewRequestFilters {
    let limit = getDataInt(req, 'limit', 10);
    if (limit < 0) {
      limit = 10;
    } else if (limit > 100) {
      limit = 100;
    }

    const user = 'filter' in req.query && req.query.filter === 'apikey' && req.user ? req.user._id : undefined;
    return {
      limit,
      skip: getDataInt(req, 'skip', 0),
      from: getDataInt(req, 'from'),
      package_id: req.pkg.id,
      user,
    };
  };

  reviewSchema.statics.parseFilters = function ({ package_id, user, from }: ReviewRequestFilters): FilterQuery<IReview> {
    const query: FilterQuery<IReview> = { package_id, redacted: false };

    if (from) {
      query.date = { $lt: new Date(from) };
    }

    if (user) {
      query.user = user;
    } else {
      // Since this is for the reviews api, don't return reviews that are only a rating
      query.body = { $ne: '' };
    }

    return query;
  };

  reviewSchema.statics.countByFilters = async function (filters: ReviewRequestFilters): Promise<number> {
    const query = this.parseFilters(filters);

    if (query.date) {
      // The date filter is for paging, so we want the count to include all the reviews, not just the ones from this date
      delete query.date;
    }

    const result = await this.countDocuments(query);
    return result;
  };

  reviewSchema.statics.findByFilters = async function (
    filters: ReviewRequestFilters,
    limit?: number,
    skip?: number,
  ): Promise<HydratedReview[]> {
    const query = this.parseFilters(filters);

    const findQuery = this.find(query).populate('user').populate('comment').sort({ date: -1 });

    if (limit) {
      void findQuery.limit(limit);
    }

    if (skip) {
      void findQuery.skip(skip);
    }

    const results = await findQuery.exec();
    return results;
  };
}
