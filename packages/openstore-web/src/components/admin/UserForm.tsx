// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useCallback } from "preact/hooks";
import { type JSX } from "preact";
import { getClientApiKey } from "../../lib/utils";
import SvgSpinner from "../icons/Spinner";
import SvgCheck from "../icons/Check";
import SvgClose from "../icons/Close";
import { type UserData, UserSchema } from "@/lib/schema";

type UserFormProps = {
  user: UserData;
  onSuccess?: (data: UserData) => void;
};

const UserForm = ({ user, onSuccess }: UserFormProps): JSX.Element => {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: user.name || "",
    username: user.username || "",
    email: user.email || "",
    website_url: user.website_url || "",
    github_profile_url: user.github_profile_url || "",
    gitlab_profile_url: user.gitlab_profile_url || "",
    ubports_forum_username: user.ubports_forum_username || "",
    donation_url: user.donation_url || "",
    description: user.description || "",
  });

  const handleInputChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    const { name, value } = target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: Event) => {
      e.preventDefault();
      setSaving(true);
      setError("");
      setSuccess(false);

      try {
        const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/users/${user._id}?apikey=${getClientApiKey()}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "openstore-web-next",
          },
          body: JSON.stringify(formData),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const updatedUser = UserSchema.parse(data.data);
            setSuccess(true);
            if (onSuccess) {
              onSuccess(updatedUser);
            }
          } else {
            setError(data.message || "Failed to update user");
          }
        } else {
          const data = await response.json();
          setError(data.message || `Error: ${response.status}`);
        }
      } catch (err) {
        console.error(err);
        setError("Error updating user profile");
      } finally {
        setSaving(false);
      }
    },
    [user._id, formData, onSuccess]
  );

  return (
    <div>
      {error && (
        <div className="bg-red-400 border-2 border-red-500 rounded flex px-4 py-3 gap-2 mb-4">
          <SvgClose className="text-red-600 w-5 h-5 flex-shrink-0" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {success && (
        <div className="bg-green-100 border-2 border-green-500 rounded flex px-4 py-3 gap-2 mb-4">
          <SvgCheck className="text-green-600 w-5 h-5 flex-shrink-0" />
          <div className="text-sm">User updated successfully!</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-1">
            Username
          </label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="Username"
            disabled={true}
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-sm text-gray-500 mt-1">Username cannot be changed</p>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Full Name"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="Email Address"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="website_url" className="block text-sm font-medium mb-1">
            Website URL
          </label>
          <input
            type="url"
            id="website_url"
            name="website_url"
            value={formData.website_url}
            onChange={handleInputChange}
            placeholder="https://example.com"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="github_profile_url" className="block text-sm font-medium mb-1">
            GitHub Profile
          </label>
          <input
            type="url"
            id="github_profile_url"
            name="github_profile_url"
            value={formData.github_profile_url}
            onChange={handleInputChange}
            placeholder="https://github.com/username"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="gitlab_profile_url" className="block text-sm font-medium mb-1">
            GitLab Profile
          </label>
          <input
            type="url"
            id="gitlab_profile_url"
            name="gitlab_profile_url"
            value={formData.gitlab_profile_url}
            onChange={handleInputChange}
            placeholder="https://gitlab.com/username"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="ubports_forum_username" className="block text-sm font-medium mb-1">
            UBports Forum Username
          </label>
          <input
            type="text"
            id="ubports_forum_username"
            name="ubports_forum_username"
            value={formData.ubports_forum_username}
            onChange={handleInputChange}
            placeholder="Forum Username"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="donation_url" className="block text-sm font-medium mb-1">
            Donation URL
          </label>
          <input
            type="url"
            id="donation_url"
            name="donation_url"
            value={formData.donation_url}
            onChange={handleInputChange}
            placeholder="https://donate.example.com"
            className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Developer description..."
            rows={4}
            className="flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="submit" class="btn bg-ubuntu-orange text-white font-bold cursor-pointer" disabled={saving}>
            {saving ? (
              <>
                <SvgSpinner className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserForm;
