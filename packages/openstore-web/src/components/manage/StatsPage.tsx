import ManageHeader from "@/components/manage/ManageHeader";
import ManageError from "./ManageError";
import Loading from "../Loading";
import { useManageApp } from "@/lib/use-manage-app";
import { Channel } from "@/lib/schema";

const CHANNEL_MAP = {
  [Channel.FOCAL as string]: "Stable",
};

type StatsPageProps = {
  id: string;
  currentLocale: string | undefined;
  messages: {
    manage: string;
    edit: string;
    newRevision: string;
    stats: string;
    badge: string;
    notFound: string;
    forbidden: string;
    unauthorized: string;
    badRequest: string;
    serverError: string;
    downloadStats: string;
    revision: string;
    channel: string;
    arch: string;
    framework: string;
    version: string;
    downloads: string;
    total: string;
  };
};

const StatsPage = ({ id, currentLocale, messages }: StatsPageProps) => {
  const [app, loading, status] = useManageApp(id);

  if (loading) {
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

  const revisions = app.revisions.toSorted((a, b) => {
    return b.revision - a.revision;
  });

  return (
    <>
      <ManageHeader
        app={app}
        breadcrumb={messages.stats}
        currentLocale={currentLocale}
        messages={{
          manage: messages.manage,
          edit: messages.edit,
          newRevision: messages.newRevision,
          stats: messages.stats,
          badge: messages.badge,
        }}
      />

      <section class="section space-y-2 grow mb-8">
        <h2 class="text-2xl">{messages.downloadStats}</h2>

        <table class="w-full">
          <thead>
            <tr>
              <th class="text-left p-1">{messages.revision}</th>
              <th>{messages.channel}</th>
              <th>{messages.arch}</th>
              <th>{messages.framework}</th>
              <th>{messages.version}</th>
              <th class="text-right p-1">{messages.downloads}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b-1 border-b-gray-300 font-extrabold">
              <td colspan={5} class="p-1">
                {messages.total}
              </td>
              <td class="text-right p-1">{app.totalDownloads.toLocaleString()}</td>
            </tr>

            {revisions.map((revision) => (
              <tr class="border-b-1 border-b-gray-300 text-center even:bg-gray-50">
                <td class="text-left p-1">{revision.revision}</td>
                <td>{CHANNEL_MAP[revision.channel] ?? revision.channel}</td>
                <td>{revision.architecture}</td>
                <td>{revision.framework}</td>
                <td>{revision.version}</td>
                <td class="text-right p-1">{revision.downloads.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
};

export default StatsPage;
