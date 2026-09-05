// SPDX-License-Identifier: AGPL-3.0-or-later
import type { UserData } from "@/lib/schema";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { getRelativeLocaleUrl } from "@/lib/utils";

type Props = {
  user: UserData;
  currentLocale: string | undefined;
  messages: {
    profile: string;
    manageApps: string;
    logout: string;
  };
};

export default function UserMenu({ user, currentLocale, messages }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="px-4 flex items-center gap-2 cursor-pointer focus:outline-none hover:opacity-90 transition-opacity w-full md:w-auto justify-start"
          aria-label="User menu"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 border-2 border-white">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-200">
                {user.username?.substring(0, 1).toUpperCase() || "U"}
              </div>
            )}
          </div>
          <span className="text-sm font-medium text-white">{user.username}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="md:w-auto w-52">
        <DropdownMenuItem asChild>
          <a href={getRelativeLocaleUrl(currentLocale, "/manage/profile/")} className="w-full cursor-pointer">
            {messages.profile}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={getRelativeLocaleUrl(currentLocale, "/manage/")} className="w-full cursor-pointer">
            {messages.manageApps}
          </a>
        </DropdownMenuItem>

        {user.role === "admin" && (
          <DropdownMenuItem asChild>
            <a href="/admin/" className="w-full cursor-pointer">
              Admin
            </a>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <a href="/logout/" className="w-full cursor-pointer">
            {messages.logout}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
