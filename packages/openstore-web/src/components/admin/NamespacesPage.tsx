import { useState, useEffect, useCallback } from "preact/hooks";
import { type JSX } from "preact";
import { getClientApiKey } from "../../lib/utils";
import SvgSpinner from "../icons/Spinner";
import SvgClose from "../icons/Close";
import NamespaceForm from "./NamespaceForm";
import NamespaceList from "./NamespaceList";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { type UserData, type NamespaceData, NamespaceListSchema } from "@/lib/schema";

type NamespacesPageProps = {};

const NamespacesPage = ({}: NamespacesPageProps): JSX.Element => {
  const [namespaces, setNamespaces] = useState<NamespaceData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingNamespace, setEditingNamespace] = useState<NamespaceData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadNamespaces = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/v4/admin/namespaces?apikey=${getClientApiKey()}`, {
        headers: { "X-Source": "openstore-web-next" },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const namespaceData = NamespaceListSchema.parse(data.data);
          setNamespaces(namespaceData);

          const uniqueUsers = new Map();
          for (const namespace of namespaceData) {
            if (namespace.owner) {
              uniqueUsers.set(namespace.owner._id, namespace.owner);
            }
          }

          setUsers(Array.from(uniqueUsers.values()));
        } else {
          setError(data.message || "Failed to load namespaces");
        }
      } else {
        setError(`Error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(err);
      setError("Error loading namespaces");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadNamespaces();
  }, [loadNamespaces]);

  const handleEdit = useCallback((namespace: NamespaceData) => {
    setEditingNamespace(namespace);
    setIsModalOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingNamespace(null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((isOpen: boolean) => {
    setIsModalOpen(isOpen);
    setEditingNamespace(null);
  }, []);

  const handleFormSuccess = useCallback(
    (_data: NamespaceData) => {
      loadNamespaces();
      setIsModalOpen(false);
      setEditingNamespace(null);
    },
    [loadNamespaces]
  );

  const handleDeleted = useCallback((id: string) => {
    setNamespaces((current) => current.filter((ns) => ns.id !== id));
  }, []);

  if (loading && namespaces.length === 0) {
    return (
      <div class="flex justify-center items-center py-12">
        <SvgSpinner class="animate-spin text-ubuntu-orange w-12 h-12" />
      </div>
    );
  }

  if (error && namespaces.length === 0) {
    return (
      <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4 mb-4">
        <SvgClose class="text-red-600" />
        <div>
          An error occurred:
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-semibold">Reserved Namespaces</h2>
        <button onClick={handleCreate} class="btn bg-ubuntu-orange text-white font-bold flex items-center gap-2 cursor-pointer">
          Create Namespace
        </button>
      </div>

      <NamespaceList namespaces={namespaces} onEdit={handleEdit} onDeleted={handleDeleted} />

      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNamespace ? "Edit Namespace" : "Create Namespace"}</DialogTitle>
          </DialogHeader>
          <NamespaceForm namespace={editingNamespace || undefined} existingOwners={users} onSuccess={handleFormSuccess} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NamespacesPage;
