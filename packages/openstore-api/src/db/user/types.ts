import { type HydratedDocument, type Model } from 'mongoose';

export interface IUser {
  apikey: string;
  email: string;
  language?: string;
  name?: string;
  role?: string;
  ubuntu_id?: string;
  github_id?: string;
  gitlab_id?: string;
  username: string;
  website_url?: string;
  github_profile_url?: string;
  gitlab_profile_url?: string;
  ubports_forum_username?: string;
  donation_url?: string;
  avatar?: string;
  description?: string;
}

export type ProfileUpdateData = Pick<IUser,
  'website_url' |
  'github_profile_url' |
  'gitlab_profile_url' |
  'ubports_forum_username' |
  'donation_url' |
  'description' |
  'avatar' |
  'role'
>;

export interface UserSerializeOutput extends Omit<IUser, 'apikey'> {
  apikey?: string;
}

export interface IUserMethods {
  serialize: (includeRole: boolean, includeApiKey: boolean) => UserSerializeOutput;
  updateProfile: (data: ProfileUpdateData, isAdmin: boolean) => Promise<void>;
}

export type HydratedUser = HydratedDocument<IUser, IUserMethods>;

export interface UserModel extends Model<IUser, unknown, IUserMethods> { }
