// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useState } from "preact/hooks";
import { type JSX } from "preact";
import SvgSpinner from "../icons/Spinner";
import SvgCheck from "../icons/Check";
import SvgClose from "../icons/Close";
import { getClientApiKey, getRelativeLocaleUrl } from "../../lib/utils";
import { AppManageSchema, PACKAGE_TYPES, PackageType, type AppManageData } from "@/lib/schema";

const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  [PackageType.CLICK]: "Click",
  [PackageType.SNAP]: "Snap",
  [PackageType.PACKAGEKIT]: "PackageKit",
};

const CreatePackageForm = ({ onSuccess }: { onSuccess?: (pkg: AppManageData) => void }): JSX.Element => {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<AppManageData | null>(null);

  const save = useCallback(
    async (e: Event) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      if (!form.reportValidity()) {
        return;
      }

      setSaving(true);
      setSuccess(false);
      setError("");

      const formData = new FormData(form);
      const requestBody = {
        id: (formData.get("id") as string).trim(),
        name: (formData.get("name") as string).trim(),
        package_type: formData.get("package_type") as string,
      };

      try {
        const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/v4/manage/?apikey=${getClientApiKey()}`, {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
            "X-Source": "openstore-web-next",
          },
        });

        const res = await response.json();
        if (response.ok && res.success) {
          const pkg = AppManageSchema.parse(res.data);
          setCreated(pkg);
          setSuccess(true);
          form.reset();
          if (onSuccess) {
            onSuccess(pkg);
          }
        } else {
          setError(typeof res?.message === "string" ? res.message : "An error occurred");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        console.error(err);
      } finally {
        setSaving(false);
      }
    },
    [onSuccess]
  );

  return (
    <form class="space-y-4" onSubmit={save}>
      <section class="section space-y-4">
        <div class="form-group">
          <label for="id" class="form-label">
            ID (App Name)
          </label>
          <input id="id" name="id" type="text" required class="form-input" autocomplete="off" />
        </div>

        <div class="form-group">
          <label for="name" class="form-label">
            App Title
          </label>
          <input id="name" name="name" type="text" required class="form-input" autocomplete="off" />
        </div>

        <div class="form-group">
          <label for="package_type" class="form-label">
            Package Type
          </label>
          <select id="package_type" name="package_type" required class="form-input" defaultValue={PackageType.PACKAGEKIT}>
            {PACKAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {PACKAGE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section class="section flex gap-4 items-center mb-4">
        <div class="flex gap-2">
          <button type="submit" class="btn bg-ubuntu-orange text-white font-bold cursor-pointer" disabled={saving}>
            {saving ? (
              <>
                <SvgSpinner class="animate-spin ml-2" />
                Creating...
              </>
            ) : (
              "Create Package"
            )}
          </button>
        </div>

        {success && <SvgCheck class="text-green-500" />}

        {created && (
          <a
            href={getRelativeLocaleUrl(undefined, `/manage/${created.id}/`)}
            class="text-sm text-ubuntu-purple hover:underline cursor-pointer"
          >
            Manage {created.id}
          </a>
        )}

        {error && (
          <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
            <SvgClose class="text-red-600" />
            <div>
              An error occurred:
              <p>{error}</p>
            </div>
          </div>
        )}
      </section>
    </form>
  );
};

export default CreatePackageForm;
