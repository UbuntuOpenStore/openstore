import SvgNavigationMenu from "../icons/NavigationMenu";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { getRelativeLocaleUrl } from "@/lib/utils";

type ManageMenuProps = {
  id: string;
  currentLocale: string | undefined;
  messages: {
    edit: string;
    newRevision: string;
    stats: string;
    badge: string;
  };
};

const ManageMenu = ({ id, currentLocale, messages }: ManageMenuProps) => {
  const baseUrl = getRelativeLocaleUrl(currentLocale, `/manage/${id}/`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" class="py-1 px-2 cursor-pointer">
          <SvgNavigationMenu class="!h-6 !w-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <a href={baseUrl} className="cursor-pointer">
            {messages.edit}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${baseUrl}revision/`} className="cursor-pointer">
            {messages.newRevision}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${baseUrl}stats/`} className="cursor-pointer">
            {messages.stats}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${baseUrl}badge/`} className="cursor-pointer">
            {messages.badge}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ManageMenu;
