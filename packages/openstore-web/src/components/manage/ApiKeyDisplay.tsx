import { useState } from "preact/hooks";
import { Button } from "@/components/ui/button";
import SvgCheck from "../icons/Check";
import SvgViewOn from "../icons/ViewOn";
import SvgViewOff from "../icons/ViewOff";
import SvgCopy from "../icons/Copy";

type ApiKeyDisplayProps = {
  apiKey: string;
  messages: {
    apiKey: string;
    yourApiKey: string;
    showApiKey: string;
    hideApiKey: string;
    copyToClipboard: string;
    copied: string;
    keepSecure: string;
    allowsAccess: string;
  };
};

const ApiKeyDisplay = ({ apiKey, messages }: ApiKeyDisplayProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <section class="section">
      <h2 class="text-2xl font-semibold mb-4">{messages.apiKey}</h2>

      <div class="max-w-2xl">
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
          <p class="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">⚠️ {messages.keepSecure}</p>
          <p class="text-sm text-yellow-700 dark:text-yellow-300">{messages.allowsAccess}</p>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{messages.yourApiKey}</label>

          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                type={isVisible ? "text" : "password"}
                value={apiKey}
                readOnly
                class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={toggleVisibility}
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none cursor-pointer"
                title={isVisible ? messages.hideApiKey : messages.showApiKey}
              >
                {isVisible ? <SvgViewOff class="w-5 h-5" /> : <SvgViewOn class="w-5 h-5" />}
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={copyToClipboard}
              aria-label={isCopied ? messages.copied : messages.copyToClipboard}
              class="cursor-pointer"
            >
              {isCopied ? <SvgCheck class="h-4 w-4" /> : <SvgCopy class="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ApiKeyDisplay;
