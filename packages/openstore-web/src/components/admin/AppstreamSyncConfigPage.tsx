// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useEffect, useCallback } from "preact/hooks";
import { type JSX } from "preact";
import { getClientApiKey } from "../../lib/utils";
import { Architecture } from "../../lib/schema";
import SvgSpinner from "../icons/Spinner";
import SvgClose from "../icons/Close";

type AppstreamSource = {
  url: string;
  icon_url: string;
  architecture: string;
  etag?: string;
  last_modified?: string;
};

type EditableSource = Pick<AppstreamSource, "url" | "icon_url" | "architecture">;

type AppstreamSyncConfig = {
  sources: AppstreamSource[];
  allowlist: string[];
};

const fieldClass = "w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange";

type SourceRowProps = {
  source: AppstreamSource;
  index: number;
  onChange: (index: number, field: keyof EditableSource, value: string) => void;
  onRemove: (index: number) => void;
};

const SourceRow = ({ source, index, onChange, onRemove }: SourceRowProps): JSX.Element => (
  <div class="border-2 border-gray-300 rounded-lg p-4 space-y-3">
    <div class="flex justify-between items-center">
      <h4 class="text-lg font-medium">Source {index + 1}</h4>
      <button type="button" onClick={() => onRemove(index)} class="btn bg-red-500 text-white text-sm px-3 py-1">
        Remove
      </button>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">URL</label>
      <input type="text" required value={source.url} onInput={(e) => onChange(index, "url", e.currentTarget.value)} class={fieldClass} />
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Icon URL</label>
      <input
        type="text"
        required
        value={source.icon_url}
        onInput={(e) => onChange(index, "icon_url", e.currentTarget.value)}
        class={fieldClass}
      />
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Architecture</label>
      <select
        required
        value={source.architecture}
        onInput={(e) => onChange(index, "architecture", e.currentTarget.value)}
        class={fieldClass}
      >
        <option value="" disabled>
          Select architecture
        </option>
        {Object.values(Architecture).map((arch) => (
          <option key={arch} value={arch}>
            {arch}
          </option>
        ))}
      </select>
    </div>

    <p class="text-sm text-gray-600">
      ETag: {source.etag || "None"}, Last modified: {source.last_modified || "None"}
    </p>
  </div>
);

type AllowlistRowProps = {
  pattern: string;
  index: number;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
};

const AllowlistRow = ({ pattern, index, onChange, onRemove }: AllowlistRowProps): JSX.Element => (
  <div class="border-2 border-gray-300 rounded-lg p-4 flex items-end gap-4">
    <div class="grow">
      <label class="block text-sm font-medium mb-1">Pattern {index + 1}</label>
      <input
        type="text"
        value={pattern}
        onInput={(e) => onChange(index, e.currentTarget.value)}
        class={fieldClass}
        placeholder="Regular expression"
      />
    </div>
    <button type="button" onClick={() => onRemove(index)} class="btn bg-red-500 text-white text-sm px-3 py-2">
      Remove
    </button>
  </div>
);

type AppstreamSyncConfigFormProps = {
  config: AppstreamSyncConfig;
};

const AppstreamSyncConfigForm = ({ config }: AppstreamSyncConfigFormProps): JSX.Element => {
  const [sources, setSources] = useState<AppstreamSource[]>(config.sources);
  const [allowlist, setAllowlist] = useState<string[]>(config.allowlist);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/v4/admin/appstream-sync-config?apikey=${getClientApiKey()}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Source": "openstore-web-next",
        },
        // Validators are server-owned, so only the editable fields are sent.
        body: JSON.stringify({
          sources: sources.map(({ url, icon_url, architecture }) => ({ url, icon_url, architecture })),
          allowlist,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSources(data.data.sources);
        setAllowlist(data.data.allowlist);
      } else {
        setError(data.message || "Failed to update AppStream sync config");
      }
    } catch (err) {
      console.error(err);
      setError("Error updating AppStream sync config");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSourceChange = (index: number, field: keyof EditableSource, value: string) => {
    setSources((prev) => prev.map((source, i) => (i === index ? { ...source, [field]: value } : source)));
  };

  const handleAddSource = () => {
    setSources((prev) => [...prev, { url: "", icon_url: "", architecture: "" }]);
  };

  const handleRemoveSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePatternChange = (index: number, value: string) => {
    setAllowlist((prev) => prev.map((pattern, i) => (i === index ? value : pattern)));
  };

  const handleAddPattern = () => {
    setAllowlist((prev) => [...prev, ""]);
  };

  const handleRemovePattern = (index: number) => {
    setAllowlist((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-8">
      <div>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-semibold">Sources</h3>
          <button type="button" onClick={handleAddSource} class="btn bg-ubuntu-orange text-white font-bold text-sm px-4 py-2">
            Add Source
          </button>
        </div>

        <div class="space-y-4">
          {sources.map((source, index) => (
            <SourceRow key={index} source={source} index={index} onChange={handleSourceChange} onRemove={handleRemoveSource} />
          ))}
        </div>
      </div>

      <div>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-semibold">Allowlist</h3>
          <button type="button" onClick={handleAddPattern} class="btn bg-ubuntu-orange text-white font-bold text-sm px-4 py-2">
            Add Pattern
          </button>
        </div>
        <p class="text-sm text-gray-600 mb-4">App IDs are matched against these regexes. An empty list allows everything.</p>

        <div class="space-y-4">
          {allowlist.map((pattern, index) => (
            <AllowlistRow key={index} pattern={pattern} index={index} onChange={handlePatternChange} onRemove={handleRemovePattern} />
          ))}
        </div>
      </div>

      <section class="flex gap-4 items-center mb-4">
        <button type="submit" disabled={submitting} class="btn bg-ubuntu-orange text-white font-bold cursor-pointer">
          {submitting ? (
            <>
              <SvgSpinner class="animate-spin ml-2" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </button>

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

type AppstreamSyncConfigPageProps = {};

const AppstreamSyncConfigPage = ({}: AppstreamSyncConfigPageProps): JSX.Element => {
  const [config, setConfig] = useState<AppstreamSyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/v4/admin/appstream-sync-config?apikey=${getClientApiKey()}`, {
        headers: { "X-Source": "openstore-web-next" },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConfig(data.data);
        } else {
          setError(data.message || "Failed to load AppStream sync config");
        }
      } else {
        setError(`Error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(err);
      setError("Error loading AppStream sync config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  if (loading && !config) {
    return (
      <div class="flex justify-center items-center py-12">
        <SvgSpinner class="animate-spin text-ubuntu-orange w-12 h-12" />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4 mb-4">
        <SvgClose class="text-red-600" />
        <div>
          An error occurred:
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-semibold">AppStream Sync Config</h2>
      </div>

      {config && <AppstreamSyncConfigForm config={config} />}
    </div>
  );
};

export default AppstreamSyncConfigPage;
