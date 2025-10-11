import { type JSX } from 'preact';

type AdminMenuProps = {
  currentPath: string;
};

const AdminMenu = ({ currentPath }: AdminMenuProps): JSX.Element => {
  return (
    <nav className="mb-8">
      <ul className="flex flex-col gap-2 md:flex-row md:gap-6">
        <li>
          <a
            href="/admin/"
            className={`block py-2 ${
              currentPath === '/admin/'
                ? 'text-ubuntu-orange border-b-2 border-ubuntu-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Dashboard
          </a>
        </li>
        <li>
          <a
            href="/admin/namespaces/"
            className={`block py-2 ${
              currentPath.startsWith('/admin/namespaces')
                ? 'text-ubuntu-orange border-b-2 border-ubuntu-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Namespaces
          </a>
        </li>
        <li>
          <a
            href="/admin/users/"
            className={`block py-2 ${
              currentPath.startsWith('/admin/users')
                ? 'text-ubuntu-orange border-b-2 border-ubuntu-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Users
          </a>
        </li>
      </ul>
    </nav>
  );
};

export default AdminMenu;
