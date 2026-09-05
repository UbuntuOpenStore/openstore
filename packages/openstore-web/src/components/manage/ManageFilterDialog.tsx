// SPDX-License-Identifier: AGPL-3.0-or-later
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "../ui/button";
import SvgFilters from "../icons/Filters";
import { AppType } from "@/lib/schema";
import { useCallback, useState } from "preact/hooks";

type ManageFilterDialogProps = {
  type: AppType | undefined;
  owner: "me" | undefined;
  published: boolean | undefined;
  isAdmin: boolean;
  onChange: (type: AppType | undefined, owner: "me" | undefined, published: boolean | undefined) => void;
  messages: {
    filters: string;
    filterByType: string;
    allTypes: string;
    apps: string;
    bookmarks: string;
    webApps: string;
    filterByStatus: string;
    allApps: string;
    published: string;
    notPublished: string;
    filterByOwner: string;
    myAppsOnly: string;
  };
};

const ManageFilterDialog = ({ type, owner, published, isAdmin, onChange, messages }: ManageFilterDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const onChangeWrapper = useCallback(
    (newType: AppType | undefined, newowner: "me" | undefined, newPublished: boolean | undefined) => {
      onChange(newType, newowner, newPublished);
      setIsOpen(false);
    },
    [onChange]
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={() => setIsOpen(true)} class="flex items-center gap-2">
          <SvgFilters class="w-4 h-4" />
          <span class="hidden md:inline">{messages.filters}</span>
        </Button>
      </DialogTrigger>
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle class="mb-4">{messages.filters}</DialogTitle>
          <div class="space-y-4 text-sm text-neutral-500">
            <h3 class="font-bold text-black">{messages.filterByType}</h3>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={!type} onClick={() => onChangeWrapper(undefined, owner, published)} id="all" />
              <label for="all">{messages.allTypes}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={type === AppType.APP} onClick={() => onChangeWrapper(AppType.APP, owner, published)} id="apps" />
              <label for="apps">{messages.apps}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.BOOKMARK}
                onClick={() => onChangeWrapper(AppType.BOOKMARK, owner, published)}
                id="bookmarks"
              />
              <label for="bookmarks">{messages.bookmarks}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.WEBAPP}
                onClick={() => onChangeWrapper(AppType.WEBAPP, owner, published)}
                id="web-apps"
              />
              <label for="web-apps">{messages.webApps}</label>
            </div>

            <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full" />

            <h3 class="font-bold text-black">{messages.filterByStatus}</h3>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={published === undefined}
                onClick={() => onChangeWrapper(type, owner, undefined)}
                id="all-status"
              />
              <label for="all-status">{messages.allApps}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={published === true} onClick={() => onChangeWrapper(type, owner, true)} id="published" />
              <label for="published">{messages.published}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={published === false} onClick={() => onChangeWrapper(type, owner, false)} id="not-published" />
              <label for="not-published">{messages.notPublished}</label>
            </div>

            {isAdmin && (
              <>
                <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full" />

                <h3 class="font-bold text-black">{messages.filterByOwner}</h3>

                <div class="flex items-center space-x-2">
                  <input type="radio" checked={!owner} onClick={() => onChangeWrapper(type, undefined, published)} id="all-apps" />
                  <label for="all-apps">{messages.allApps}</label>
                </div>

                <div class="flex items-center space-x-2">
                  <input type="radio" checked={owner === "me"} onClick={() => onChangeWrapper(type, "me", published)} id="my-apps" />
                  <label for="my-apps">{messages.myAppsOnly}</label>
                </div>
              </>
            )}
          </div>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};

export default ManageFilterDialog;
