import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import SvgSpinner from '../icons/Spinner';
import SvgCheck from '../icons/Check';
import SvgClose from '../icons/Close';
import { getClientApiKey } from '../../lib/utils';
import {
  UserListSchema,
  type UserData,
  type NamespaceData,
  NamespaceSchema
} from '@/lib/schema';

type NamespaceFormProps = {
  namespace?: NamespaceData;
  existingOwners?: UserData[];
  onSuccess?: (data: NamespaceData) => void;
};

const NamespaceForm = ({ namespace, existingOwners = [], onSuccess }: NamespaceFormProps) => {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState(namespace?.owner_id || '');
  const [searchQuery, setSearchQuery] = useState(namespace?.owner?.username || '');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const isEditing = !!namespace?.id;

  // Update form state when namespace prop changes
  useEffect(() => {
    if (namespace) {
      setSelectedOwnerId(namespace.owner_id || '');
      setSearchQuery(namespace.owner?.username || '');
    } else {
      setSelectedOwnerId('');
      setSearchQuery('');
    }
  }, [namespace]);

  const searchUsers = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}api/users?q=${encodeURIComponent(query)}&apikey=${getClientApiKey()}`,
        {
          headers: { 'X-Source': 'openstore-web-next' }
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setSearchResults(UserListSchema.parse(data.data));
        }
      }
      else {
        setError('Failed to find users');
        setSearchResults([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    const query = target.value;
    setSearchQuery(query);
    searchUsers(query);
  }, [searchUsers]);

  const selectUser = useCallback((user: UserData) => {
    console.log(user);
    setSelectedOwnerId(user._id);
    setSearchQuery(user.username);
    setSearchResults([]);
  }, []);

  const save = useCallback(async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (form.reportValidity()) {
      setSaving(true);
      setSuccess(false);
      setError('');

      const formData = new FormData(form);
      const namespaceValue = formData.get('namespace') as string;
      const typeValue = formData.get('type') as string;

      const requestBody = {
        namespace: namespaceValue,
        type: typeValue,
        ownerId: selectedOwnerId
      };

      try {
        const url = isEditing
          ? `${import.meta.env.PUBLIC_API_URL}api/v4/admin/namespaces/${namespace.id}?apikey=${getClientApiKey()}`
          : `${import.meta.env.PUBLIC_API_URL}api/v4/admin/namespaces?apikey=${getClientApiKey()}`;

        const response = await fetch(url, {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(requestBody),
          headers: {
            'Content-Type': 'application/json',
            'X-Source': 'openstore-web-next'
          }
        });

        const res = await response.json();
        if (response.ok) {
          setSuccess(true);
          if (res.success && onSuccess) {
            const validatedData = NamespaceSchema.parse(res.data);
            onSuccess(validatedData);
          }
        } else {
          let message = "An error occurred";
          if (res && typeof res.message === 'string') {
            message = res.message;
          }
          setError(message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        console.error(err);
      } finally {
        setSaving(false);
      }
    }
  }, [isEditing, namespace, onSuccess, selectedOwnerId]);

  const selectedOwner = existingOwners.find(user => user._id === selectedOwnerId) ||
                        (namespace?.owner_id === selectedOwnerId ? namespace?.owner : undefined);

  return (
    <form class="space-y-4" onSubmit={save}>
      <section class="section space-y-4">
        <div class="form-group">
          <label for="namespace" class="form-label">
            Namespace
          </label>
          <input
            id="namespace"
            name="namespace"
            type="text"
            required
            class="form-input"
            defaultValue={namespace?.namespace || ''}
            disabled={isEditing}
            placeholder="app.namespace or *.namespace"
          />
        </div>
        <p class="mt-1 text-xs text-gray-500 text-right">Format: app.namespace (exact) or *.namespace (wildcard)</p>

        <div class="form-group">
          <label for="type" class="form-label">
            Reservation Type
          </label>
          <select
            id="type"
            name="type"
            required
            class="form-input"
            defaultValue={namespace?.type || 'exact'}
          >
            <option value="exact">Exact Match</option>
            <option value="wildcard">Wildcard</option>
          </select>
        </div>
        <p class="mt-1 text-xs text-gray-500 text-right">
          {namespace?.type === 'wildcard'
            ? "Wildcard restricts an entire namespace (e.g., *.ubuntu)"
            : "Exact match restricts a specific package ID"}
        </p>

        <div class="form-group">
          <label for="owner-search" class="form-label">
            Owner
          </label>
          <div class="relative w-full">
            <input
              ref={searchRef}
              id="owner-search"
              type="text"
              class="form-input"
              placeholder="Search users..."
              value={searchQuery}
              onInput={handleSearchChange}
              autocomplete="off"
            />
            {isSearching && (
              <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
                <SvgSpinner class="animate-spin text-gray-400" />
              </div>
            )}

            {searchResults.length > 0 && (
              <div class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {searchResults.map((user) => (
                  <div
                    key={user._id}
                    class="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-100"
                    onClick={() => selectUser(user)}
                  >
                    <span>{user.username}</span>
                    {user.email && <span class="text-sm text-gray-500">({user.email})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedOwnerId && selectedOwner && (
            <div class="mt-2 flex items-center gap-2 p-2 border border-gray-300 rounded">
              <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-100">
                {selectedOwner.avatar ? (
                  <img
                    src={selectedOwner.avatar}
                    alt={selectedOwner.username}
                    class="w-full h-full object-cover"
                  />
                ) : (
                  <div class="w-full h-full flex items-center justify-center text-gray-400">
                    {selectedOwner.username?.substring(0, 1).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <span>{selectedOwner.username}</span>
              <input type="hidden" name="ownerId" value={selectedOwnerId} />
            </div>
          )}
        </div>
      </section>

      <section class="section flex gap-4 items-center mb-4">
        <div class="flex gap-2">
          <button type="submit" class="btn bg-ubuntu-orange text-white font-bold cursor-pointer" disabled={saving}>
            {saving ? (
              <>
                <SvgSpinner class="animate-spin ml-2" />
                Saving...
              </>
            ) : isEditing ? (
              "Save"
            ) : (
              "Create"
            )}
          </button>
        </div>

        {success && <SvgCheck class="text-green-500" />}

        {error && (
          <>
            <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
              <SvgClose class="text-red-600" />
              <div>
                An error occurred:
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

export default NamespaceForm;
