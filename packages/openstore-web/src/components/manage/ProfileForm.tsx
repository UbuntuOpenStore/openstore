import { useState, useCallback, useRef } from 'preact/hooks';
import SvgSpinner from '../icons/Spinner';
import SvgCheck from '../icons/Check';
import SvgClose from '../icons/Close';
import type { UserData } from '@/lib/schema';
import { getClientApiKey } from '@/lib/utils';
import type { JSX } from 'preact/jsx-runtime';

type ProfileFormProps = {
  user: UserData;
  messages: {
    errorOccurred: string;
    username: string;
    usernameCannotBeChanged: string;
    email: string;
    emailManagedByProvider: string;
    avatar: string;
    uploadNewAvatar: string;
    profilePicture: string;
    imageFileTypes: string;
    biography: string;
    shortBio: string;
    maximumChars: string;
    contactLinks: string;
    websiteURL: string;
    githubProfileURL: string;
    gitlabProfileURL: string;
    ubportsForumUsername: string;
    donationURL: string;
    saving: string;
    save: string;
  };
};

const ProfileForm = ({ user, messages }: ProfileFormProps) => {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = useCallback(async (e: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.currentTarget.reportValidity()) {
      setSaving(true);
      setSuccess(false);
      setError('');

      const formData = new FormData(e.currentTarget);

      // Convert GitHub username to URL
      const githubUsername = formData.get('github_username');
      if (githubUsername) {
        formData.delete('github_username');
        formData.append('github_profile_url', `https://github.com/${githubUsername}`);
      }

      // Convert GitLab username to URL
      const gitlabUsername = formData.get('gitlab_username');
      if (gitlabUsername) {
        formData.delete('gitlab_username');
        formData.append('gitlab_profile_url', `https://gitlab.com/${gitlabUsername}`);
      }

      try {
        const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/users/me?apikey=${getClientApiKey()}`, {
          method: 'PUT',
          body: formData,
          headers: { 'X-Source': 'openstore-web-next' }
        });

        if (response.ok) {
          setSuccess(true);

          if (fileRef.current) {
            fileRef.current.value = '';
          }
        } else {
          const errorBody = await response.json();
          let message = messages.errorOccurred;
          if (errorBody && typeof errorBody.message === 'string') {
            message = errorBody.message;
          }
          setError(message);
        }
      } catch (err) {
        setError(messages.errorOccurred);
        console.error(err);
      } finally {
        setSaving(false);
      }
    }
  }, [messages]);

  return (
    <form class="space-y-4" onSubmit={save}>
      <section class="section space-y-4">
        <div class="form-group">
          <label for="username" class="form-label">
            {messages.username}
          </label>
          <input
            id="username"
            type="text"
            readOnly
            value={user.username}
            class="form-input bg-gray-100"
          />
        </div>
        <p class="mt-1 text-xs text-gray-500 text-right">{messages.usernameCannotBeChanged}</p>

        <div class="form-group">
          <label for="email" class="form-label">
            {messages.email}
          </label>
          <input
            id="email"
            type="email"
            readOnly
            value={user.email || ''}
            class="form-input bg-gray-100"
          />
        </div>
        <p class="mt-1 text-xs text-gray-500 text-right">{messages.emailManagedByProvider}</p>
      </section>

      <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

      <section class="section space-y-4">
        <h2 class="text-2xl">{messages.avatar}</h2>

        <div class="form-group">
          <label for="avatar" class="form-label">
            {messages.uploadNewAvatar}
          </label>
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={messages.profilePicture}
                  class="w-full h-full object-cover"
                />
              ) : (
                <div class="w-full h-full flex items-center justify-center text-gray-400">
                  {user.username?.substring(0, 1).toUpperCase() || 'U'}
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png"
              class="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <p class="mt-1 text-xs text-gray-500">{messages.imageFileTypes}</p>
        </div>
      </section>

      <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

      <section class="section space-y-4">
        <h2 class="text-2xl">{messages.biography}</h2>

        <div class="form-group">
          <label for="description" class="form-label">
            {messages.shortBio}
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={200}
            class="form-input"
            defaultValue={user.description || ''}
          />
        </div>
        <p class="mt-1 text-xs text-gray-500 text-right">{messages.maximumChars}</p>
      </section>

      <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

      <section class="section space-y-4">
        <h2 class="text-2xl">{messages.contactLinks}</h2>

        <div class="form-group">
          <label for="website_url" class="form-label">
            {messages.websiteURL}
          </label>
          <input
            id="website_url"
            name="website_url"
            type="url"
            placeholder="https://example.com"
            class="form-input"
            defaultValue={user.website_url || ''}
          />
        </div>

        <div class="form-group">
          <label for="github_username" class="form-label">
            {messages.githubProfileURL}
          </label>
          <input
            id="github_username"
            name="github_username"
            type="text"
            placeholder="username"
            class="form-input"
            defaultValue={user.github_profile_url ? user.github_profile_url.replace('https://github.com/', '') : ''}
          />
        </div>

        <div class="form-group">
          <label for="gitlab_username" class="form-label">
            {messages.gitlabProfileURL}
          </label>
          <input
            id="gitlab_username"
            name="gitlab_username"
            type="text"
            placeholder="username"
            class="form-input"
            defaultValue={user.gitlab_profile_url ? user.gitlab_profile_url.replace('https://gitlab.com/', '') : ''}
          />
        </div>

        <div class="form-group">
          <label for="ubports_forum_username" class="form-label">
            {messages.ubportsForumUsername}
          </label>
          <input
            id="ubports_forum_username"
            name="ubports_forum_username"
            type="text"
            placeholder="username"
            class="form-input"
            defaultValue={user.ubports_forum_username || ''}
          />
        </div>

        <div class="form-group">
          <label for="donation_url" class="form-label">
            {messages.donationURL}
          </label>
          <input
            id="donation_url"
            name="donation_url"
            type="url"
            placeholder="https://example.com/donate"
            class="form-input"
            defaultValue={user.donation_url || ''}
          />
        </div>
      </section>

      <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

      <section class="section flex gap-4 items-center mb-4">
        <button type="submit" class="btn bg-ubuntu-orange text-white font-bold cursor-pointer" disabled={saving}>
          {saving ? (
            <>
              <SvgSpinner class="animate-spin ml-2" />
              {messages.saving}
            </>
          ) : (
            messages.save
          )}
        </button>

        {success && <SvgCheck class="text-green-500" />}

        {error && (
          <>
            <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
              <SvgClose class="text-red-600" />
              <div>
                {messages.errorOccurred}:
                <p>
                  {error}
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </form>
  );
};

export default ProfileForm;
