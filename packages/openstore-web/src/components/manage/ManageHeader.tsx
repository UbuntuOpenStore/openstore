import type { AppManageData } from "@/lib/schema";
import SvgHome from "../icons/Home";
import Ratings from "../apps/Ratings";
import ManageMenu from "./ManageMenu";
import { getRelativeLocaleUrl } from "@/lib/utils";

type ManageHeaderProps = {
  app: AppManageData;
  breadcrumb: string;
  currentLocale: string | undefined;
  messages: {
    manage: string;
    edit: string;
    newRevision: string;
    stats: string;
    badge: string;
  };
};

const ManageHeaders = ({ app, breadcrumb, currentLocale, messages }: ManageHeaderProps) => {
  return (
    <>
      <section class="section flex justify-between items-center">
        <div class="flex">
          <a href={getRelativeLocaleUrl(currentLocale, "/")}>
            <SvgHome />
          </a>

          <div class="ml-1">
            /{" "}
            <a href={getRelativeLocaleUrl(currentLocale, "/manage/")} class="underline">
              {messages.manage}
            </a>
          </div>
          <div class="ml-1 text-ellipsis inline-block max-w-32 md:max-w-64 whitespace-nowrap overflow-hidden">
            /{" "}
            <a href={getRelativeLocaleUrl(currentLocale, `/manage/${app.id}/`)} class="underline">
              {app.name}
            </a>
          </div>
          <div class="ml-1">/ {breadcrumb}</div>
        </div>

        <ManageMenu
          id={app.id}
          currentLocale={currentLocale}
          messages={{
            edit: messages.edit,
            newRevision: messages.newRevision,
            stats: messages.stats,
            badge: messages.badge,
          }}
        />
      </section>

      <section class="section space-y-4">
        <h1 class="text-4xl">
          {messages.manage} {app.name}
        </h1>

        <Ratings app={app} />
      </section>
    </>
  );
};

export default ManageHeaders;
