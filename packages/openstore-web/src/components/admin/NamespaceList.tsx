import { useState, useCallback } from 'preact/hooks';
import { type JSX } from 'preact';
import SvgSpinner from '../icons/Spinner';
import SvgClose from '../icons/Close';
import { getClientApiKey } from '../../lib/utils';
import { type NamespaceData } from '@/lib/schema';

type NamespaceListProps = {
  namespaces: NamespaceData[];
  onEdit: (namespace: NamespaceData) => void;
  onDeleted: (id: string) => void;
};

const NamespaceList = ({ namespaces = [], onEdit, onDeleted }: NamespaceListProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleDeleteClick = useCallback((namespace: NamespaceData) => {
    if (window.confirm(`Are you sure you want to delete the namespace ${namespace.namespace}?`)) {
      deleteNamespace(namespace.id);
    }
  }, []);

  const deleteNamespace = useCallback(async (id: string) => {
    setDeletingId(id);
    setError('');

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}api/v4/admin/namespaces/${id}?apikey=${getClientApiKey()}`,
        {
          method: 'DELETE',
          headers: { 'X-Source': 'openstore-web-next' }
        }
      );

      if (response.ok) {
        onDeleted(id);
      } else {
        const errorBody = await response.json();
        let message = "An error occurred";
        if (errorBody && typeof errorBody.message === 'string') {
          message = errorBody.message;
        }
        setError(message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }, [onDeleted]);

  const handleSearchChange = useCallback((e: JSX.TargetedEvent<HTMLInputElement>) => {
    setSearchQuery(e.currentTarget.value.toLowerCase());
  }, []);

  const filteredNamespaces = namespaces.filter((namespace) => {
    if (searchQuery) {
      const namespaceMatch = namespace.namespace.toLowerCase().includes(searchQuery);
      const ownerMatch = namespace.owner?.username.toLowerCase().includes(searchQuery);
      return namespaceMatch || ownerMatch;
    }

    return true;
  });

  return (
    <div>
      <div class="mb-4">
        <div class="form-group">
          <input
            type="text"
            placeholder="Filter namespaces or owners..."
            class="form-input"
            value={searchQuery}
            onInput={handleSearchChange}
          />
        </div>
      </div>

      {error && (
        <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4 mb-4">
          <SvgClose class="text-red-600" />
          <div>
            An error occurred:
            <p>
              {error}
            </p>
          </div>
        </div>
      )}

      {filteredNamespaces.length === 0 ? (
        <div class="text-center py-8 text-gray-500">
          No namespaces found
        </div>
      ) : (
        <div class="overflow-x-auto">
          <table class="min-w-full table-auto">
            <thead>
              <tr class="bg-gray-100">
                <th class="px-4 py-2 text-left">Namespace</th>
                <th class="px-4 py-2 text-left">Reservation Type</th>
                <th class="px-4 py-2 text-left">Owner</th>
                <th class="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredNamespaces.map((namespace) => (
                <tr key={namespace.id} class="border-b">
                  <td class="px-4 py-2">{namespace.namespace}</td>
                  <td class="px-4 py-2">
                    {namespace.type === 'exact' ? "Exact" : "Wildcard"}
                  </td>
                  <td class="px-4 py-2">
                    {namespace.owner ? (
                      <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-100">
                          {namespace.owner.avatar ? (
                            <img
                              src={namespace.owner.avatar}
                              alt={namespace.owner.username}
                              class="w-full h-full object-cover"
                            />
                          ) : (
                            <div class="w-full h-full flex items-center justify-center text-gray-400">
                              {namespace.owner.username?.substring(0, 1).toUpperCase() || 'U'}
                            </div>
                          )}
                        </div>
                        <span title={namespace.owner.email}>{namespace.owner.name || namespace.owner.username}</span>
                      </div>
                    ) : (
                      <span class="text-gray-400">{namespace.owner_id}</span>
                    )}
                  </td>
                  <td class="px-4 py-2 text-center">
                    <div class="flex justify-end gap-2">
                      <button
                        type="button"
                        class="btn bg-ubuntu-purple text-white font-bold cursor-pointer"
                        onClick={() => onEdit(namespace)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="btn bg-red-500 text-white font-bold cursor-pointer"
                        onClick={() => handleDeleteClick(namespace)}
                        disabled={deletingId === namespace.id}
                      >
                        {deletingId === namespace.id ? (
                          <>
                            <SvgSpinner class="animate-spin inline mr-1" />
                            Deleting...
                          </>
                        ) : (
                          "Delete"
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default NamespaceList;
