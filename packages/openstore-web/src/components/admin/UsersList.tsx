// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useCallback } from "preact/hooks";
import { type JSX } from "preact";
import { type UserData } from "@/lib/schema";
import { getClientApiKey } from "../../lib/utils";
import SvgSpinner from "../icons/Spinner";
import SvgCheck from "../icons/Check";

type UsersListProps = {
  users: UserData[];
  onEdit: (user: UserData) => void;
  onRoleChanged: (userId: string, role: string | undefined) => void;
};

const UsersList = ({ users, onEdit, onRoleChanged }: UsersListProps): JSX.Element => {
  const [updatingRole, setUpdatingRole] = useState<Record<string, boolean>>({});
  const [successRole, setSuccessRole] = useState<Record<string, boolean>>({});
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});

  const handleRoleChange = useCallback(
    async (user: UserData, newRole: string | undefined) => {
      setUpdatingRole((prev) => ({ ...prev, [user._id]: true }));
      setErrorMessages((prev) => ({ ...prev, [user._id]: "" }));

      try {
        const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/users/${user._id}?apikey=${getClientApiKey()}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "openstore-web-next",
          },
          body: JSON.stringify({ role: newRole }),
        });

        if (response.ok) {
          onRoleChanged(user._id, newRole);
          setSuccessRole((prev) => ({ ...prev, [user._id]: true }));

          // Clear success indicator after 2 seconds
          setTimeout(() => {
            setSuccessRole((prev) => ({ ...prev, [user._id]: false }));
          }, 2000);
        } else {
          const data = await response.json();
          setErrorMessages((prev) => ({ ...prev, [user._id]: data.message || "Failed to update role" }));
        }
      } catch (err) {
        console.error(err);
        setErrorMessages((prev) => ({ ...prev, [user._id]: "Network error" }));
      } finally {
        setUpdatingRole((prev) => ({ ...prev, [user._id]: false }));
      }
    },
    [onRoleChanged]
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            <th className="py-3 px-4 text-left">Username</th>
            <th className="py-3 px-4 text-left">Name</th>
            <th className="py-3 px-4 text-left">Email</th>
            <th className="py-3 px-4 text-left">Role</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user._id} className="hover:bg-gray-50">
              <td className="py-3 px-4">{user.username}</td>
              <td className="py-3 px-4">{user.name || "--"}</td>
              <td className="py-3 px-4">{user.email || "--"}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <select
                    className="border rounded px-2 py-1"
                    value={user.role}
                    onChange={(e) => handleRoleChange(user, e.currentTarget.value || undefined)}
                    disabled={updatingRole[user._id]}
                  >
                    <option value="community">Community</option>
                    <option value="trusted">Trusted</option>
                    <option value="admin">Admin</option>
                    <option value="disabled">Disabled</option>
                  </select>

                  {updatingRole[user._id] && <SvgSpinner className="w-5 h-5 text-ubuntu-orange animate-spin" />}

                  {successRole[user._id] && <SvgCheck className="w-5 h-5 text-green-500" />}
                </div>

                {errorMessages[user._id] && <p className="text-red-500 text-sm mt-1">{errorMessages[user._id]}</p>}
              </td>
              <td className="py-3 px-4 text-right">
                <button type="button" class="btn bg-ubuntu-purple text-white font-bold cursor-pointer" onClick={() => onEdit(user)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UsersList;
