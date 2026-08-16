import { useCallback, useState } from "preact/hooks";
import SvgSpinner from "../icons/Spinner";
import SvgCheck from "../icons/Check";
import SvgClose from "../icons/Close";
import { getClientApiKey, getRelativeLocaleUrl } from "@/lib/utils";

const SubmitAppForm = ({
  currentLocale,
  messages,
}: {
  currentLocale: string | undefined;
  messages: {
    appName: string;
    appNameDescription: string;
    appTitle: string;
    submitApp: string;
    save: string;
    failedToUpdateApp: string;
    mustBeLoggedIn: string;
    unknownError: string;
  };
}) => {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const apikey = getClientApiKey();
  const save = useCallback(async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (form.reportValidity()) {
      setSaving(true);
      setSuccess(false);
      setError("");

      const formData = new FormData(form);
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}api/v4/manage/?apikey=${apikey}`, {
        method: "POST",
        body: JSON.stringify({
          id: formData.get("id"),
          name: formData.get("name"),
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Source": "openstore-web-next",
        },
      });

      if (response.ok) {
        setSuccess(true);

        location.pathname = getRelativeLocaleUrl(currentLocale, `/manage/${formData.get("id")}/`);
      } else {
        const errorBody = await response.json();
        let message = messages.unknownError;
        if (errorBody && typeof errorBody.message === "string") {
          message = errorBody.message;
        }

        setError(message);
      }

      setSaving(false);
    }
  }, []);

  if (!apikey) {
    return (
      <p>
        <a href={getRelativeLocaleUrl(currentLocale, "/login/")} class="underline">
          {messages.mustBeLoggedIn}
        </a>
      </p>
    );
  }

  return (
    <form class="space-y-4" onSubmit={save}>
      <h2 class="text-2xl">{messages.submitApp}</h2>

      <section class="section space-y-4">
        <div class="form-group">
          <label for="id" class="form-label">
            {messages.appName}
          </label>
          <input id="id" name="id" type="text" required class="form-input" />
        </div>

        <div class="flex flex-row-reverse">
          <p class="text-xs text-gray-500 md:text-right md:max-w-3/4">{messages.appNameDescription}</p>
        </div>

        <div class="form-group">
          <label for="name" class="form-label">
            {messages.appTitle}
          </label>
          <input id="name" name="name" type="text" required class="form-input" />
        </div>
      </section>

      <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

      <section class="section flex gap-4 items-center">
        <button type="submit" class="btn bg-ubuntu-orange text-white font-bold cursor-pointer" disabled={saving}>
          {messages.save}
          {saving && <SvgSpinner class="animate-spin ml-2" />}
        </button>

        {success && <SvgCheck class="text-green-500" />}

        {error && (
          <>
            <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
              <SvgClose class="text-red-600" />
              <div>
                {messages.failedToUpdateApp}
                <p>{error}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </form>
  );
};

export default SubmitAppForm;
