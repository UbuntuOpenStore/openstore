// SPDX-License-Identifier: AGPL-3.0-or-later
import { type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IComment {
  user: Types.ObjectId;
  date: Date;
  body: string;
}

export type HydratedComment = HydratedDocument<IComment>;
export interface CommentModel extends Model<IComment> {}
