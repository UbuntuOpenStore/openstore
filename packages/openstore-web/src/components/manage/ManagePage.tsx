// SPDX-License-Identifier: AGPL-3.0-or-later
import ManageHeader from "@/components/manage/ManageHeader";
import ManageError from "./ManageError";
import Loading from "../Loading";
import { useManageApp } from "@/lib/use-manage-app";
import ManageAppForm from "./ManageAppForm";
import type { UserData } from "@/lib/schema";
import { useManageMaintainers } from "@/lib/use-manage-maintainers";

type ManagePageProps = {
  id: string;
  user: UserData;
  currentLocale: string | undefined;
  messages: {
    manage: string;
    edit: string;
    newRevision: string;
    stats: string;
    badge: string;
    packageDetails: string;
    id: string;
    packageType: string;
    publisher: string;
    publishedDate: string;
    updatedDate: string;
    architectures: string;
    architecture: string;
    translationLanguages: string;
    none: string;
    notFound: string;
    forbidden: string;
    unauthorized: string;
    badRequest: string;
    serverError: string;
    deleteApp: string;
    deleteApplication: string;
    cancel: string;
    confirmDelete: string;
    deleting: string;
    areYouSure: string;
    hasRevisionsWarning: string;
    cannotBeUndone: string;
    error: string;
    failedToDelete: string;
    errorOccurred: string;
  };
};

const ManagePage = ({ id, user, currentLocale, messages }: ManagePageProps) => {
  const [app, loading, status, refreshApp] = useManageApp(id);
  const maintainers = useManageMaintainers(user.role === "admin");

  if (!app && loading) {
    return <Loading />;
  }

  if (!app) {
    return (
      <ManageError
        status={status}
        messages={{
          notFound: messages.notFound,
          forbidden: messages.forbidden,
          unauthorized: messages.unauthorized,
          badRequest: messages.badRequest,
          serverError: messages.serverError,
        }}
      />
    );
  }

  return (
    <>
      <ManageHeader
        app={app}
        breadcrumb={messages.edit}
        currentLocale={currentLocale}
        messages={{
          manage: messages.manage,
          edit: messages.edit,
          newRevision: messages.newRevision,
          stats: messages.stats,
          badge: messages.badge,
        }}
      />

      <div class="grow">
        <ManageAppForm user={user} app={app} maintainers={maintainers} onSave={refreshApp} currentLocale={currentLocale} messages={messages} />

        <div class="w-full h-[1px] bg-ubuntu-gradient rounded-full mx-auto max-w-6xl"></div>

        <section class="section space-y-2">
          <h2 class="text-2xl">{messages.packageDetails}</h2>

          <table>
            <tbody>
              <tr class="border-b-1 border-b-gray-300">
                <td class="p-2 font-bold">{messages.id}</td>
                <td>{app.id}</td>
              </tr>

              <tr class="border-b-1 border-b-gray-300">
                <td class="p-2 font-bold">{messages.packageType}</td>
                <td>{app.package_type || messages.none}</td>
              </tr>

              <tr class="border-b-1 border-b-gray-300">
                <td class="p-2 font-bold">{messages.publisher}</td>
                <td>{app.publisher || messages.none}</td>
              </tr>

              {app.published_date && (
                <tr class="border-b-1 border-b-gray-300">
                  <td class="p-2 font-bold">{messages.publishedDate}</td>
                  <td>{new Date(app.published_date).toLocaleString()}</td>
                </tr>
              )}

              {app.updated_date && (
                <tr class="border-b-1 border-b-gray-300">
                  <td class="p-2 font-bold">{messages.updatedDate}</td>
                  <td>{new Date(app.updated_date).toLocaleString()}</td>
                </tr>
              )}

              <tr class="border-b-1 border-b-gray-300">
                <td class="p-2 font-bold">
                  {app.architectures.length > 1 ? messages.architectures : messages.architecture}
                </td>
                <td>{app.architectures.length > 0 ? app.architectures.join(", ") : messages.none}</td>
              </tr>

              <tr class="border-b-1 border-b-gray-300">
                <td class="p-2 pr-4 font-bold whitespace-nowrap">{messages.translationLanguages}</td>
                <td>{app.languages.length > 0 ? app.languages.join(", ") : messages.none}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
};

export default ManagePage;
