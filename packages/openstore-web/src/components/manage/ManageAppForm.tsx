import { AppManageSchema, type AppData, type AppManageData, type UserData } from "@/lib/schema";
import { Switch } from "../ui/switch";
import { APP_TYPE_OPTIONS, CATEGORIES, LICENSES } from "@/lib/constants";
import SortableScreenshots from "./SortableScreenshots";
import { useCallback, useRef, useState } from "preact/hooks";
import SvgSpinner from "../icons/Spinner";
import type { JSX } from "preact/jsx-runtime";
import SvgCheck from "../icons/Check";
import SvgClose from "../icons/Close";
import { getClientApiKey } from "@/lib/utils";
import DeleteApp from "./DeleteApp";
import SvgExternalLink from "../icons/ExternalLink";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";

type ManageAppFormProps = {
  user: UserData;
  app: AppManageData;
  maintainers: (UserData & { display_name: string })[];
  onSave: () => void;
  currentLocale: string | undefined;
};

const ManageAppForm = ({ user, app, maintainers, onSave, currentLocale }: ManageAppFormProps) => {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [screenshots, setScreenshots] = useState(app.screenshots);
  const [newVersionChangelogs, setNewVersionChangelogs] = useState<Array<{ id: number; version: string; changelog: string }>>([]);
  const [removedVersions, setRemovedVersions] = useState<Set<string>>(new Set());
  const [confirmRemoveVersion, setConfirmRemoveVersion] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>();

  const addNewVersionChangelog = useCallback(() => {
    setNewVersionChangelogs((prev) => [...prev, { id: Math.random(), version: "", changelog: "" }]);
  }, []);

  const removeVersionChangelog = useCallback((id: number) => {
    setNewVersionChangelogs((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const removeExistingVersionChangelog = useCallback((version: string) => {
    setRemovedVersions((prev) => new Set([...prev, version]));
    setConfirmRemoveVersion(null);
  }, []);

  const handleOpenConfirmRemove = useCallback((version: string) => {
    setConfirmRemoveVersion(version);
  }, []);

  const handleCancelConfirmRemove = useCallback(() => {
    setConfirmRemoveVersion(null);
  }, []);

  const handleConfirmRemoveDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setConfirmRemoveVersion(null);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (confirmRemoveVersion) removeExistingVersionChangelog(confirmRemoveVersion);
  }, [confirmRemoveVersion, removeExistingVersionChangelog]);

  const save = useCallback(async (e: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.currentTarget.reportValidity()) {
      setSaving(true);
      setSuccess(false);
      setError("");

      const formData = new FormData(e.currentTarget);
      const entries = Array.from(formData.entries());

      const newFormData = new FormData();
      let screenshotFileCount = 0;

      const versionChangelogs: AppData["version_changelogs"] = [];

      // Helper function to strip 'v' prefix from version strings
      const normalizeVersion = (version: string): string => {
        return version.replace(/^v/, "");
      };

      for (const [key, value] of entries) {
        if (key === "screenshot_files") {
          if (screenshotFileCount < 5) {
            screenshotFileCount++;
            newFormData.append(key, value);
          }
        } else if (key === "published" || key === "nsfw" || key === "locked") {
          // Skip
        } else if (key.startsWith("version_changelogs[") && key.endsWith("]")) {
          const versionMatch = key.match(/\[(.*?)\]/);
          if (versionMatch && versionMatch[1] && typeof value === "string") {
            const version = normalizeVersion(versionMatch[1]);
            versionChangelogs.push({ version, changelog: value });
          }
        } else if (key.startsWith("new_version_") && typeof value === "string") {
          const id = key.replace("new_version_", "");
          const changelog = formData.get(`new_changelog_${id}`);
          if (value && changelog && typeof changelog === "string") {
            const version = normalizeVersion(value);
            versionChangelogs.push({ version, changelog });
          }
        } else if (!key.startsWith("new_changelog_")) {
          // Don't add new_changelog_ fields as they're handled above
          newFormData.append(key, value);
        }
      }

      newFormData.append("version_changelogs", JSON.stringify(versionChangelogs));
      newFormData.append("published", formData.get("published") ? "on" : "off");
      newFormData.append("nsfw", formData.get("nsfw") ? "on" : "off");
      newFormData.append("locked", formData.get("locked") ? "on" : "off");

      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/v3/manage/${app.id}?apikey=${getClientApiKey()}`, {
        method: "PUT",
        body: newFormData,
        headers: { "X-Source": "openstore-web-next" },
      });

      if (response.ok) {
        const appData = AppManageSchema.parse((await response.json()).data);
        setScreenshots(appData.screenshots);
        setNewVersionChangelogs([]);
        setRemovedVersions(new Set());

        if (fileRef.current) {
          fileRef.current.value = "";
        }

        setSuccess(true);

        onSave();
      } else {
        const errorBody = await response.json();
        let message = "An unknown error has occurred";
        if (errorBody && typeof errorBody.message === "string") {
          message = errorBody.message;
        }

        setError(message);
      }

      setSaving(false);
    }
  }, []);

  return (
    <>
      <form class="space-y-4" onSubmit={save}>
        <section class="section space-y-4">
          <div class="form-group">
            <label for="published" class="form-label">
              Published
              {app.published && (
                <a href={`/app/${app.id}/`} target="_blank">
                  <SvgExternalLink class="inline-block w-4 h-4 ml-1 mt-[-5px]" />
                </a>
              )}
            </label>
            <Switch id="published" name="published" defaultChecked={app.published} />
          </div>
        </section>

        <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

        <section class="section space-y-4">
          <h2 class="text-2xl">Presentation</h2>

          <div class="form-group">
            <label for="name" class="form-label">
              Title
            </label>
            <input id="name" name="name" type="text" value={app.name} required class="form-input" />
          </div>

          <div class="form-group">
            <label for="license" class="form-label">
              License
            </label>
            <select id="license" name="license" class="form-input">
              <option value="">License</option>
              {LICENSES.map((license) => (
                <option value={license} selected={app.license === license}>
                  {license}
                </option>
              ))}
            </select>
          </div>

          <div class="form-group">
            <label for="tagline" class="form-label">
              Tag Line
            </label>
            <input id="tagline" name="tagline" type="text" value={app.tagline} required class="form-input" />
          </div>

          <div class="form-group">
            <label for="description" class="form-label">
              Description
            </label>
            <textarea id="description" name="description" required class="form-input" rows={4}>
              {app.description}
            </textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Changelogs</label>
            <div class="border rounded-md w-full max-h-96 overflow-auto min-h-26">
              <div class="p-4">
                {newVersionChangelogs.map((entry) => (
                  <div key={entry.id} class="border-b pb-2 flex items-start gap-4 mb-2">
                    <div class="flex flex-col min-w-[120px] gap-2">
                      <div class="flex items-center justify-between gap-2">
                        <h4 class="font-bold whitespace-nowrap">New Version</h4>
                        <button
                          type="button"
                          class="text-sm text-red-600 hover:text-red-800 cursor-pointer"
                          onClick={() => removeVersionChangelog(entry.id)}
                        >
                          <SvgClose class="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        type="text"
                        class="form-input w-full"
                        placeholder="Version (e.g. 1.0.0)"
                        name={`new_version_${entry.id}`}
                        required
                      />
                    </div>
                    <textarea
                      name={`new_changelog_${entry.id}`}
                      class="form-input w-full resize-vertical"
                      rows={3}
                      placeholder="Enter changelog for this version..."
                      required
                    ></textarea>
                  </div>
                ))}

                {app.version_changelogs
                  .filter((vc) => !removedVersions.has(vc.version))
                  .map((versionChangelog) => (
                    <div key={versionChangelog.version} class="border-b pb-2 last:border-0 last:pb-0 flex items-start gap-4 mb-2">
                      <div class="flex flex-col min-w-[120px] gap-2">
                        <div class="flex items-center justify-between gap-2">
                          <h4 class="font-bold whitespace-nowrap">v{versionChangelog.version}</h4>
                          <button
                            type="button"
                            class="text-sm text-red-600 hover:text-red-800 cursor-pointer"
                            onClick={() => handleOpenConfirmRemove(versionChangelog.version)}
                          >
                            <SvgClose class="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        name={`version_changelogs[${versionChangelog.version}]`}
                        class="form-input w-full resize-vertical"
                        rows={3}
                        defaultValue={versionChangelog.changelog}
                      ></textarea>
                    </div>
                  ))}
              </div>

              <div class="p-4 text-right sticky bottom-0 bg-white">
                <button type="button" class="btn bg-ubuntu-purple text-white font-bold cursor-pointer" onClick={addNewVersionChangelog}>
                  Add New Changelog
                </button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="changelog" class="form-label">
              Legacy Changelog <span class="text-xs text-red-500">(Deprecated)</span>
            </label>
            <textarea
              id="changelog"
              name="changelog"
              class="form-input"
              rows={4}
              placeholder="This field is deprecated. Please use version-specific changelogs above."
            >
              {app.changelog}
            </textarea>
          </div>
          <p class="mt-1 text-xs text-gray-500 text-right">
            This global changelog is being deprecated in favor of version-specific changelogs.
          </p>

          <div class="form-group">
            <label for="screenshot_files" class="form-label">
              Screenshots (Limit 5)
            </label>
            <input
              type="file"
              id="screenshot_files"
              name="screenshot_files"
              accept="image/*"
              multiple
              disabled={screenshots.length >= 5}
              class="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              ref={fileRef as any}
            />
          </div>
          <div class="form-group">
            <div class="form-label">{/* Intentionally left blank */}</div>
            <SortableScreenshots screenshots={screenshots} onUpdate={setScreenshots} />
          </div>

          <div class="form-group">
            <label for="banner_file" class="form-label">
              Banner Image (SVG only)
            </label>
            <input
              type="file"
              id="banner_file"
              name="banner_file"
              accept=".svg"
              class="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <p class="mt-1 text-xs text-gray-500 text-right">
            Upload an SVG banner image for your app. This will be displayed if you app is featured on the discover page.
          </p>

          {app.banner && (
            <div class="form-group">
              <label class="form-label">Current Banner</label>
              <div class="border rounded-md p-4">
                <img src={app.banner} alt="App banner" class="max-h-40 min-h-32" />
              </div>
            </div>
          )}
        </section>

        <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

        <section class="section space-y-2">
          <h2 class="text-2xl">Discovery</h2>

          <div class="form-group">
            <label for="category" class="form-label">
              Category
            </label>
            <select id="category" name="category" class="form-input">
              <option value="">Category</option>
              {CATEGORIES.map((category) => (
                <option value={category} selected={app.category === category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div class="form-group">
            <label for="keywords" class="form-label">
              Keywords
            </label>
            <input id="keywords" name="keywords" type="text" value={app.keywords.join(", ")} class="form-input" />
          </div>

          <div class="form-group">
            <label for="nsfw" class="form-label">
              NSFW
            </label>
            <input
              id="nsfw"
              name="nsfw"
              type="checkbox"
              checked={app.nsfw}
              class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <p class="mt-1 text-xs text-gray-500">This app contains NSFW (Not Safe For Work) material</p>
          </div>
        </section>

        <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

        <section class="section space-y-2">
          <h2 class="text-2xl">Links</h2>

          <div class="form-group">
            <label for="source" class="form-label">
              Source URL
            </label>
            <input id="source" name="source" type="text" value={app.source} class="form-input" />
          </div>

          <div class="form-group">
            <label for="support_url" class="form-label">
              Support URL
            </label>
            <input id="support_url" name="support_url" type="text" value={app.support_url} class="form-input" />
          </div>

          <div class="form-group">
            <label for="donate_url" class="form-label">
              Donate URL
            </label>
            <input id="donate_url" name="donate_url" type="text" value={app.donate_url} class="form-input" />
          </div>

          <div class="form-group">
            <label for="video_url" class="form-label">
              Video URL
            </label>
            <input id="video_url" name="video_url" type="text" value={app.video_url} class="form-input" />
          </div>

          <p class="mt-1 text-xs text-gray-500 text-right">Only YouTube, Vimeo, Rumble, and PeerTube videos are supported at this time.</p>

          <div class="form-group">
            <label for="translation_url" class="form-label">
              Translation URL
            </label>
            <input id="translation_url" name="translation_url" type="text" value={app.translation_url} class="form-input" />
          </div>
        </section>

        <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

        {user.role === "admin" && (
          <>
            <section class="section space-y-2">
              <h2 class="text-2xl">Admin</h2>

              <div class="form-group">
                <label for="locked" class="form-label">
                  Locked
                </label>
                <Switch id="locked" name="locked" defaultChecked={app.locked} />
              </div>

              <div class="form-group">
                <label for="maintainer" class="form-label">
                  Maintainer
                </label>
                <select id="maintainer" name="maintainer" class="form-input">
                  <option value="">Maintainer</option>
                  {maintainers.map((maintainer) => (
                    <option value={maintainer._id} selected={app.maintainer === maintainer._id}>
                      {maintainer.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div class="form-group">
                <label for="type_override" class="form-label">
                  Type Override
                </label>
                <select id="type_override" name="type_override" class="form-input">
                  <option value="">None</option>
                  {APP_TYPE_OPTIONS.map((type) => (
                    <option value={type.value} selected={app.type_override === type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Review Exceptions</label>

                {app.review_exceptions.length > 0 ? (
                  <ul class="list-disc list-inside">
                    {app.review_exceptions.map((exception) => (
                      <li>{exception}</li>
                    ))}
                  </ul>
                ) : (
                  <span>None</span>
                )}
              </div>
            </section>

            <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>
          </>
        )}

        <section class="section flex justify-between mb-4">
          <div class="flex gap-4 items-center">
            <button type="submit" class="btn bg-ubuntu-orange text-white font-bold cursor-pointer" disabled={saving}>
              Save
              {saving && <SvgSpinner class="animate-spin ml-2" />}
            </button>

            {success && <SvgCheck class="text-green-500" />}

            {error && (
              <>
                <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
                  <SvgClose class="text-red-600" />
                  <div>
                    Failed to update your app:
                    <p>{error}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <DeleteApp app={app} currentLocale={currentLocale} />
        </section>
      </form>

      <Dialog open={confirmRemoveVersion !== null} onOpenChange={handleConfirmRemoveDialogOpenChange}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle class="text-red-600">Remove Changelog</DialogTitle>
          </DialogHeader>

          <div class="py-4">
            <p>
              Are you sure you want to remove the changelog for <strong>v{confirmRemoveVersion}</strong>?
            </p>
            <p class="text-red-600 mt-2">This will be applied when you save the form.</p>
          </div>

          <DialogFooter class="flex gap-2">
            <button class="btn bg-white text-black font-bold cursor-pointer border border-gray-200" onClick={handleCancelConfirmRemove}>
              Cancel
            </button>
            <button class="btn bg-red-600 text-white font-bold cursor-pointer" onClick={handleConfirmRemove}>
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageAppForm;
