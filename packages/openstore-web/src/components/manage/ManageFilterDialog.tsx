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
};

const ManageFilterDialog = ({ type, owner, published, isAdmin, onChange }: ManageFilterDialogProps) => {
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
          <span class="hidden md:inline">Filters</span>
        </Button>
      </DialogTrigger>
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle class="mb-4">Filters</DialogTitle>
          <div class="space-y-4 text-sm text-neutral-500">
            <h3 class="font-bold text-black">Filter by Type</h3>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={!type} onClick={() => onChangeWrapper(undefined, owner, published)} id="all" />
              <label for="all">All Types</label>
            </div>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={type === AppType.APP} onClick={() => onChangeWrapper(AppType.APP, owner, published)} id="apps" />
              <label for="apps">Apps</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.BOOKMARK}
                onClick={() => onChangeWrapper(AppType.BOOKMARK, owner, published)}
                id="bookmarks"
              />
              <label for="bookmarks">Bookmarks</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.WEBAPP}
                onClick={() => onChangeWrapper(AppType.WEBAPP, owner, published)}
                id="web-apps"
              />
              <label for="web-apps">Web Apps</label>
            </div>

            <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full" />

            <h3 class="font-bold text-black">Filter by Status</h3>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={published === undefined}
                onClick={() => onChangeWrapper(type, owner, undefined)}
                id="all-status"
              />
              <label for="all-status">All Apps</label>
            </div>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={published === true} onClick={() => onChangeWrapper(type, owner, true)} id="published" />
              <label for="published">Published</label>
            </div>

            <div class="flex items-center space-x-2">
              <input type="radio" checked={published === false} onClick={() => onChangeWrapper(type, owner, false)} id="not-published" />
              <label for="not-published">Not Published</label>
            </div>

            {isAdmin && (
              <>
                <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full" />

                <h3 class="font-bold text-black">Filter by Owner</h3>

                <div class="flex items-center space-x-2">
                  <input type="radio" checked={!owner} onClick={() => onChangeWrapper(type, undefined, published)} id="all-apps" />
                  <label for="all-apps">All Apps</label>
                </div>

                <div class="flex items-center space-x-2">
                  <input type="radio" checked={owner === "me"} onClick={() => onChangeWrapper(type, "me", published)} id="my-apps" />
                  <label for="my-apps">My Apps Only</label>
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
