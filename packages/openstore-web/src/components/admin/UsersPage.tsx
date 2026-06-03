import { useState, useEffect, useCallback } from 'preact/hooks';
import { type JSX } from 'preact';
import { getClientApiKey } from '../../lib/utils';
import SvgSpinner from '../icons/Spinner';
import SvgClose from '../icons/Close';
import UserForm from './UserForm';
import UsersList from './UsersList';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { type UserData, UserListSchema } from '@/lib/schema';

type UsersPageProps = {};

const UsersPage = ({}: UsersPageProps): JSX.Element => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}api/users?apikey=${getClientApiKey()}`,
        {
          headers: { 'X-Source': 'openstore-web-next' }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const userData = UserListSchema.parse(data.data);
          setUsers(userData);
        }
        else {
          setError(data.message || 'Failed to load users');
        }
      } else {
        setError(`Error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(err);
      setError('Error loading users');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleEdit = useCallback((user: UserData) => {
    setEditingUser(user);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((isOpen: boolean) => {
    setIsModalOpen(isOpen);
    setEditingUser(null);
  }, []);

  const handleFormSuccess = useCallback((_data: UserData) => {
    loadUsers();
    setIsModalOpen(false);
    setEditingUser(null);
  }, [loadUsers]);

  const handleRoleChanged = useCallback((userId: string, role: string | undefined) => {
    setUsers((current) =>
      current.map(user =>
        user._id === userId ? { ...user, role } : user
      )
    );
  }, []);

  if (loading && users.length === 0) {
    return (
      <div class="flex justify-center items-center py-12">
        <SvgSpinner class="animate-spin text-ubuntu-orange w-12 h-12" />
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4 mb-4">
        <SvgClose class="text-red-600" />
        <div>
          An error occurred:
          <p>
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-semibold">User Management</h2>
      </div>

      <UsersList
        users={users}
        onEdit={handleEdit}
        onRoleChanged={handleRoleChanged}
      />

      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <UserForm
              user={editingUser}
              onSuccess={handleFormSuccess}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
