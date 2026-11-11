// SPDX-License-Identifier: AGPL-3.0-or-later
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "../ui/button";
import SvgFilters from "../icons/Filters";
import { AppType, PackageType } from "@/lib/schema";
import { useCallback, useState } from "preact/hooks";

type ManageFilterDialogProps = {
  type: AppType | undefined;
  owner: "me" | undefined;
  published: boolean | undefined;
  packageType: PackageType | undefined;
  isAdmin: boolean;
  clickSupportEnabled: boolean;
  onChange: (
    type: AppType | undefined,
    owner: "me" | undefined,
    published: boolean | undefined,
    packageType: PackageType | undefined
  ) => void;
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
    filterByPackageType: string;
    allPackageTypes: string;
    click: string;
    snap: string;
    packagekit: string;
  };
};

const ManageFilterDialog = ({
  type,
  owner,
  published,
  packageType,
  isAdmin,
  clickSupportEnabled,
  onChange,
  messages,
}: ManageFilterDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const onChangeWrapper = useCallback(
    (
      newType: AppType | undefined,
      newowner: "me" | undefined,
      newPublished: boolean | undefined,
      newPackageType: PackageType | undefined
    ) => {
      onChange(newType, newowner, newPublished, newPackageType);
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
              <input
                type="radio"
                checked={!type}
                onClick={() => onChangeWrapper(undefined, owner, published, packageType)}
                id="all"
              />
              <label for="all">{messages.allTypes}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.APP}
                onClick={() => onChangeWrapper(AppType.APP, owner, published, packageType)}
                id="apps"
              />
              <label for="apps">{messages.apps}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.BOOKMARK}
                onClick={() => onChangeWrapper(AppType.BOOKMARK, owner, published, packageType)}
                id="bookmarks"
              />
              <label for="bookmarks">{messages.bookmarks}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={type === AppType.WEBAPP}
                onClick={() => onChangeWrapper(AppType.WEBAPP, owner, published, packageType)}
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
                onClick={() => onChangeWrapper(type, owner, undefined, packageType)}
                id="all-status"
              />
              <label for="all-status">{messages.allApps}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={published === true}
                onClick={() => onChangeWrapper(type, owner, true, packageType)}
                id="published"
              />
              <label for="published">{messages.published}</label>
            </div>

            <div class="flex items-center space-x-2">
              <input
                type="radio"
                checked={published === false}
                onClick={() => onChangeWrapper(type, owner, false, packageType)}
                id="not-published"
              />
              <label for="not-published">{messages.notPublished}</label>
            </div>

            {isAdmin && (
              <>
                <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full" />

                <h3 class="font-bold text-black">{messages.filterByOwner}</h3>

                <div class="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={!owner}
                    onClick={() => onChangeWrapper(type, undefined, published, packageType)}
                    id="all-apps"
                  />
                  <label for="all-apps">{messages.allApps}</label>
                </div>

                <div class="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={owner === "me"}
                    onClick={() => onChangeWrapper(type, "me", published, packageType)}
                    id="my-apps"
                  />
                  <label for="my-apps">{messages.myAppsOnly}</label>
                </div>

                <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full" />

                <h3 class="font-bold text-black">{messages.filterByPackageType}</h3>

                <div class="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={!packageType}
                    onClick={() => onChangeWrapper(type, owner, published, undefined)}
                    id="all-package-types"
                  />
                  <label for="all-package-types">{messages.allPackageTypes}</label>
                </div>

                {clickSupportEnabled && (
                  <div class="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={packageType === PackageType.CLICK}
                      onClick={() => onChangeWrapper(type, owner, published, PackageType.CLICK)}
                      id="click"
                    />
                    <label for="click">{messages.click}</label>
                  </div>
                )}

                <div class="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={packageType === PackageType.SNAP}
                    onClick={() => onChangeWrapper(type, owner, published, PackageType.SNAP)}
                    id="snap"
                  />
                  <label for="snap">{messages.snap}</label>
                </div>

                <div class="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={packageType === PackageType.PACKAGEKIT}
                    onClick={() => onChangeWrapper(type, owner, published, PackageType.PACKAGEKIT)}
                    id="packagekit"
                  />
                  <label for="packagekit">{messages.packagekit}</label>
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
