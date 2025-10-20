import ManageHeader from "@/components/manage/ManageHeader";
import ManageError from "./ManageError";
import Loading from "../Loading";
import { useManageApp } from "@/lib/use-manage-app";
import { Channel } from "@/lib/schema";

const CHANNEL_MAP = {
  [Channel.FOCAL as string]: "Stable",
};

const StatsPage = ({ id }: { id: string}) => {
  const [app, loading, status] = useManageApp(id);

  if (loading) {
    return (
      <Loading />
    )
  }

  if (!app) {
    return (
      <ManageError status={status} />
    )
  }

  const revisions = app.revisions.toSorted((a, b) => {
    return b.revision - a.revision;
  });

  return (
    <>
      <ManageHeader app={app} breadcrumb="Stats" />

      <section class="section space-y-2 grow mb-8">
        <h2 class="text-2xl">Download Stats</h2>

        <table class="w-full">
          <thead>
            <tr>
              <th class="text-left p-1">Revision</th>
              <th>Channel</th>
              <th>Arch</th>
              <th>Framework</th>
              <th>Version</th>
              <th class="text-right p-1">Downloads</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b-1 border-b-gray-300 font-extrabold">
              <td colspan={5} class="p-1">Total</td>
              <td class="text-right p-1">{app.totalDownloads.toLocaleString()}</td>
            </tr>

            {
              revisions.map((revision) => (
                <tr class="border-b-1 border-b-gray-300 text-center even:bg-gray-50">
                  <td class="text-left p-1">{revision.revision}</td>
                  <td>{CHANNEL_MAP[revision.channel] ?? revision.channel}</td>
                  <td>{revision.architecture}</td>
                  <td>{revision.framework}</td>
                  <td>{revision.version}</td>
                  <td class="text-right p-1">{revision.downloads.toLocaleString()}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </section>
    </>
  );
}

export default StatsPage;
