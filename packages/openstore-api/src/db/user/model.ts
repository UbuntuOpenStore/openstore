import { Schema, model } from 'mongoose';
import { type IUser, type IUserMethods, type UserModel, type ProfileUpdateData } from './types';
import { ValidationError } from '../../exceptions';
import { config } from '../../utils/config';
import { sanitize } from '../../utils/sanitize';

const userSchema = new Schema<IUser, UserModel, IUserMethods>({
  apikey: String,
  email: String,
  language: String,
  name: String,
  role: String,
  ubuntu_id: { type: String, index: true },
  github_id: String,
  gitlab_id: String,
  username: String,
  website_url: String,
  github_profile_url: String,
  gitlab_profile_url: String,
  ubports_forum_username: String,
  donation_url: String,
  avatar: String,
  description: { type: String, maxlength: 200 },
});

userSchema.method('serialize', function (includeRole: boolean, includeApiKey: boolean, includeEmail: boolean) {
  const userData: Record<string, any> = {
    _id: this._id,
    name: this.name ? this.name : this.username,
    username: this.username,
    language: this.language,
    website_url: this.website_url,
    github_profile_url: this.github_profile_url,
    gitlab_profile_url: this.gitlab_profile_url,
    ubports_forum_username: this.ubports_forum_username,
    donation_url: this.donation_url,
    avatar: this.avatar ? `${config.server.host}/avatars/${this.avatar}` : undefined,
    description: this.description,
  };

  if (includeRole) {
    userData.role = this.role ? this.role : 'community';
  }

  if (includeApiKey) {
    userData.apikey = this.apikey;
  }

  if (includeEmail) {
    userData.email = this.email;

    const providers: string[] = [];
    if (this.ubuntu_id) { providers.push('ubuntu'); }
    if (this.github_id) { providers.push('github'); }
    if (this.gitlab_id) { providers.push('gitlab'); }
    userData.login_providers = providers;
  }

  return userData;
});

userSchema.method('updateProfile', async function (data: ProfileUpdateData, isAdmin: boolean) {
  // Only admins can update the role
  if (isAdmin && data.role !== undefined) {
    this.role = data.role;
  }

  const allowedFields: Array<keyof ProfileUpdateData> = [
    'website_url',
    'github_profile_url',
    'gitlab_profile_url',
    'ubports_forum_username',
    'donation_url',
    'description',
    'avatar',
  ];

  if (data.description) {
    if (data.description.length > 200) {
      throw new ValidationError('Description must be 200 characters or less');
    }
    data.description = sanitize(data.description);
  }

  const urlFields: Array<keyof ProfileUpdateData> = ['website_url', 'github_profile_url', 'gitlab_profile_url', 'donation_url'];
  for (const field of urlFields) {
    if (data[field]) {
      try {
        const url = new URL(data[field]);
        if (url.protocol !== 'https:') {
          throw new ValidationError(`${field} must use HTTPS protocol`);
        }
      }
      catch (error) {
        throw new ValidationError(`Invalid URL provided for ${field}`);
      }
    }
  }

  for (const field of allowedFields) {
    if (field in data && data[field] !== undefined) {
      this[field] = data[field];
    }
  }

  await this.save();
});

export const User = model<IUser, UserModel>('User', userSchema);
