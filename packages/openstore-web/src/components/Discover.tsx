// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "preact/hooks";
import HighlightedApps from "@/components/apps/HighlightedApps";
import AppList from "@/components/apps/AppList";
import { Architecture, DEFAULT_CHANNEL, DiscoverSchema, type DiscoverData } from "@/lib/schema";
import { categorySlug, getRelativeLocaleUrl, localeSlugToCode } from "@/lib/utils";
import * as Sentry from "@sentry/astro";
import Loading from "./Loading";

type Props = {
  currentLocale: string | undefined;
  messages: {
    new: string;
    app: string;
    bookmark: string;
    webapp: string;
  };
};

const Discover = ({ currentLocale, messages }: Props) => {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const lang = localeSlugToCode(currentLocale);

    fetch(`${import.meta.env.PUBLIC_API_URL}api/v4/discover?channel=${DEFAULT_CHANNEL}&lang=${lang}&architecture=${Architecture.ARM64}`, {
      headers: { "X-Source": "openstore-web-next" },
    })
      .then((response) => response.json())
      .then((json) => {
        setData(DiscoverSchema.parse(json.data));
      })
      .catch((err) => {
        console.error(err);
        Sentry.captureException(err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Loading />;
  }

  if (error || !data) {
    return <div class="text-center text-red-500">Failed to load discover data.</div>;
  }

  const { highlights, categories } = data;

  return (
    <>
      <section class="py-3 px-3 mx-auto w-full max-w-2xl md:px-4">
        <HighlightedApps highlights={highlights} currentLocale={currentLocale} />
      </section>

      <section class="section">
        {categories.map((category, index) => (
          <>
            <div>
              <h2 class="text-2xl text-center font-bold">
                {category.referral ? (
                  <a href={getRelativeLocaleUrl(currentLocale, `/apps/${categorySlug(category.referral)}/`)} class="underline">
                    {category.name}
                  </a>
                ) : (
                  <>{category.name}</>
                )}
              </h2>
              <p class="mb-4 text-center">{category.tagline}</p>

              <AppList apps={category.apps} messages={messages} currentLocale={currentLocale} />
            </div>

            {index < categories.length - 1 && <div class="mx-auto w-full max-w-6xl h-1 bg-ubuntu-gradient rounded-full mb-4" />}
          </>
        ))}
      </section>
    </>
  );
};

export default Discover;
