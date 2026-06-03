import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { AppSearchSchema, AppType, type SlimAppData } from "@/lib/schema";
import Pagination from "../Pagination";
import SvgSpinner from "../icons/Spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import * as Sentry from "@sentry/astro";
import SvgSearch from "../icons/Search";
import ManageFilterDialog from "./ManageFilterDialog";
import TopRating from "../apps/TopRating";
import Ratings from "../apps/Ratings";
import SvgGrid from "../icons/Grid";
import SvgList from "../icons/List";
import { getRelativeLocaleUrl } from "@/lib/utils";

const PAGE_SIZE = 32;
const DEFAULT_SORT = "name";

type ManageListProps = {
  apikey: string;
  isAdmin: boolean;
  userId: string;
  currentLocale: string | undefined;
};

type ViewMode = "grid" | "list";

const SORT_OPTIONS = [
  { value: "name", label: "Title (A-Z)" },
  { value: "-name", label: "Title (Z-A)" },
  { value: "-calculated_rating", label: "Most Popular" },
  { value: "calculated_rating", label: "Least Popular" },
  { value: "-published_date", label: "Newest" },
  { value: "published_date", label: "Oldest" },
  { value: "-updated_date", label: "Latest Update" },
  { value: "updated_date", label: "Oldest Update" },
];

const ManageList = ({ apikey, isAdmin, userId, currentLocale }: ManageListProps) => {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const urlPage = parseInt(hashParams.get("page") ?? "0");

  const [page, setPage] = useState(isNaN(urlPage) ? 0 : urlPage);
  const [totalPages, setTotalPages] = useState(0);
  const [localSearch, setLocalSearch] = useState(hashParams.get("search") || "");
  const [query, setQuery] = useState({
    search: hashParams.get("search") || "",
    sort: hashParams.get("sort") ?? DEFAULT_SORT,
    type: hashParams.get("type") as AppType | undefined,
    owner: hashParams.get("owner") as "me" | undefined,
    published: hashParams.get("published") === "true" ? true : hashParams.get("published") === "false" ? false : undefined,
  });
  const [apps, setApps] = useState<SlimAppData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useMemo(async () => {
    setLoading(true);

    const skip = page * PAGE_SIZE;
    const url = new URL(`${import.meta.env.PUBLIC_API_URL}api/v3/manage`);
    url.searchParams.append("apikey", apikey);
    url.searchParams.append("limit", PAGE_SIZE.toString());
    url.searchParams.append("skip", skip.toString());
    url.searchParams.append("sort", query.sort);
    url.searchParams.append("search", query.search);

    if (query.type) {
      url.searchParams.append("type", query.type);
    }

    if (query.owner === "me") {
      url.searchParams.append("publisher_id", userId);
    }

    if (query.published !== undefined) {
      url.searchParams.append("published", query.published.toString());
    }

    const updateParams = new URLSearchParams();
    if (query.search) {
      updateParams.append("search", query.search);
    }
    if (query.sort !== DEFAULT_SORT) {
      updateParams.append("sort", query.sort);
    }
    if (query.type) {
      updateParams.append("type", query.type);
    }
    if (query.owner) {
      updateParams.append("owner", query.owner);
    }
    if (query.published !== undefined) {
      updateParams.append("published", query.published.toString());
    }
    if (page > 0) {
      updateParams.append("page", page.toString());
    }

    const newHash = updateParams.size > 0 ? `#${updateParams.toString()}` : "";
    window.history.replaceState({}, "", window.location.pathname + window.location.search + newHash);

    try {
      const response = await fetch(url, { headers: { "X-Source": "openstore-web-next" } });
      const { data } = await response.json();
      const search = AppSearchSchema.parse(data);

      setApps(search.packages);
      setTotalPages(Math.ceil(data.count / PAGE_SIZE));
    } catch (err) {
      console.error(err);
      Sentry.captureException(err);

      setError(true);
    }

    setLoading(false);
  }, [query, page]);

  const setPageWrapper = useCallback((update: number) => {
    if (update < 0) {
      update = 0;
    }

    setPage(update);
  }, []);

  const setSort = useCallback((value: string) => {
    setQuery((previous) => ({ ...previous, sort: value }));
  }, []);

  const setFilters = useCallback((type: AppType | undefined, owner: "me" | undefined, published: boolean | undefined) => {
    setQuery((previous) => ({ ...previous, type, owner, published }));
  }, []);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localSearch !== query.search) {
        setQuery((previous) => ({ ...previous, search: localSearch }));
        setPage(0);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [localSearch, query.search]);

  return (
    <div class="space-y-4 mb-4">
      <div class="flex justify-between flex-col md:flex-row gap-4">
        <div class="md:mx-4 flex gap-2">
          <div class="w-80 relative">
            <input
              type="text"
              placeholder="Search..."
              aria-label="Search"
              class="w-full h-full py-2 px-4 pr-10 rounded-full border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              value={localSearch}
              onInput={(e) => setLocalSearch((e.target as HTMLInputElement).value)}
            />

            <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
              <SvgSearch class="h-5 w-5 text-gray-500" />
            </div>
          </div>

          <ManageFilterDialog type={query.type} owner={query.owner} published={query.published} isAdmin={isAdmin} onChange={setFilters} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" class="whitespace-nowrap min-w-[120px]">
                <span class="hidden md:inline">Sort by: </span>
                {SORT_OPTIONS.find((option) => option.value === query.sort)!.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56 mr-4">
              <DropdownMenuLabel>Sort Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.value} onClick={() => setSort(option.value)}>
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            class="px-4 py-2"
          >
            {viewMode === "grid" ? <SvgList class="h-4 w-4" /> : <SvgGrid class="h-4 w-4" />}
          </Button>
        </div>

        <a href={getRelativeLocaleUrl(currentLocale, "/submit/")} class="btn bg-ubuntu-orange text-white inline-block">
          Submit
        </a>
      </div>

      {error ? (
        <div class="h-full text-2xl text-red">There was an error loading the app list. Please try again later.</div>
      ) : (
        <>
          {loading ? (
            <div class="h-full">
              <SvgSpinner class="animate-spin w-12 h-12 text-ubuntu-purple mx-auto" />
            </div>
          ) : (
            <>
              {apps.length > 0 ? (
                <>
                  {viewMode === "grid" ? (
                    <div class="grid grid-cols-2 md:grid-cols-4">
                      {apps.map((app) => (
                        <a
                          href={getRelativeLocaleUrl(currentLocale, `/manage/${app.id}/`)}
                          class="flex flex-row gap-4 max-w-xl mb-4 py-2 px-1 md:p-4"
                          key={app.id}
                        >
                          <img
                            class="rounded-2xl max-w-[64px] max-h-[64px]"
                            src={app.icon}
                            alt=""
                            width="64"
                            height="64"
                            loading="lazy"
                            style={`view-transition-name: app-${app.id.replace(/\./g, "-")}`}
                          />
                          <div>
                            <div class="text-md md:text-lg text-ellipsis line-clamp-2 font-bold break-all">{app.name}</div>

                            <p>{app.publisher}</p>
                            <TopRating ratings={app.ratings} />
                            <p class={app.published ? "text-ubuntu-purple" : "text-gray-400"}>
                              {app.published ? "Published" : "Not Published"}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div class="space-y-2">
                      {apps.map((app) => (
                        <a
                          href={getRelativeLocaleUrl(currentLocale, `/manage/${app.id}/`)}
                          class="flex flex-col md:flex-row gap-4 md:items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          key={app.id}
                        >
                          <div class="flex flex-row gap-4 items-start md:items-center flex-1 min-w-0">
                            <img
                              class="rounded-2xl flex-shrink-0"
                              src={app.icon}
                              alt=""
                              width="64"
                              height="64"
                              loading="lazy"
                              style={`view-transition-name: app-${app.id.replace(/\./g, "-")}`}
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-lg font-bold break-words">{app.name}</div>
                              <p class="text-gray-600">{app.publisher}</p>
                              <p class={app.published ? "text-ubuntu-purple" : "text-gray-400"}>
                                {app.published ? "Published" : "Not Published"}
                              </p>
                            </div>
                          </div>

                          <div class="flex-shrink-0 md:w-80">
                            <Ratings app={app} />
                          </div>

                          <div class="flex-shrink-0 md:w-[180px] text-left md:text-right">
                            <div class="text-gray-600">
                              Total Downloads: <span class="font-bold">{app.totalDownloads?.toLocaleString() ?? 0}</span>
                            </div>
                            <div class="text-sm text-gray-500">Latest: {app.latestDownloads?.toLocaleString() ?? 0}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <Pagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChanged={(p) => setPageWrapper(p)}
                      messages={{
                        previous: "Go back a page",
                        next: "Go to the next page",
                      }}
                    />
                  )}
                </>
              ) : (
                <div class="h-full text-2xl">No apps found</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ManageList;
