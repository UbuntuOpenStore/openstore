import { useStore } from "@nanostores/preact";
import { searchTerm, searchTermInitialized } from "@/stores";
import SvgSearch from "./icons/Search";
import { useDebouncedCallback } from "use-debounce";
import { useEffect, useState } from "preact/hooks";
import { cn } from "@/lib/utils";

const SearchBar = ({ messages, isDark, isSearchPage }: { messages: { search: string }; isDark: boolean; isSearchPage?: boolean }) => {
  const term = useStore(searchTerm);
  const initialized = useStore(searchTermInitialized);
  const [localValue, setLocalValue] = useState("");

  useEffect(() => {
    if (!initialized) {
      const hash = new URLSearchParams(document.location.hash.substring(1));
      const initialTerm = hash.get("search") ?? "";
      searchTerm.set(initialTerm);
      setLocalValue(initialTerm);
      searchTermInitialized.set(true);
    }
  }, [initialized]);

  // Update local value when store term changes (for search page)
  useEffect(() => {
    if (isSearchPage) {
      setLocalValue(term);
    }
  }, [term, isSearchPage]);

  const performSearch = (value: string) => {
    searchTerm.set(value);

    if (!document.location.pathname.startsWith("/apps/")) {
      const updateHash = new URLSearchParams();
      updateHash.append("search", value);
      updateHash.append("sort", "relevance");

      document.location.replace(`/apps/#${updateHash.toString()}`);
    }
  };

  const debounceSetTerm = useDebouncedCallback(performSearch, 300);

  const handleInput = (value: string) => {
    setLocalValue(value);

    if (isSearchPage) {
      // On search page, use debounced search
      debounceSetTerm(value);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch(localValue);
    }
  };

  const handleSearchClick = () => {
    performSearch(localValue);
  };

  return (
    <div class="relative max-w-sm w-full h-full">
      <input
        type="text"
        placeholder={messages.search}
        aria-label="Search"
        class={cn(
          "w-full h-full py-2 px-4 pr-10 rounded-full border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          isDark ? "text-white" : "text-black"
        )}
        value={localValue}
        onInput={(e) => handleInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />

      <button
        type="button"
        onClick={handleSearchClick}
        aria-label="Submit search"
        class="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer"
      >
        <SvgSearch class="h-5 w-5 text-gray-500" />
      </button>
    </div>
  );
};

export default SearchBar;
