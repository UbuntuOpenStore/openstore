import ManageHeader from "@/components/manage/ManageHeader";
import ManageError from "./ManageError";
import Loading from "../Loading";
import { useManageApp } from "@/lib/use-manage-app";
import RevisionForm from "./RevisionForm";

type RevisionPageProps = {
  id: string;
  currentLocale: string | undefined;
  messages: {
    manage: string;
    edit: string;
    newRevision: string;
    stats: string;
    badge: string;
    revision: string;
    notFound: string;
    forbidden: string;
    unauthorized: string;
    badRequest: string;
    serverError: string;
    appstreamMetainfo: string;
    appstreamDescription: string;
    clickFiles: string;
    multipleFilesDescription: string;
    changelog: string;
    upload: string;
    return: string;
    unknownError: string;
    networkError: string;
    uploadAborted: string;
  };
};

const RevisionPage = ({ id, currentLocale, messages }: RevisionPageProps) => {
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

  return (
    <>
      <ManageHeader
        app={app}
        breadcrumb={messages.revision}
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
        <RevisionForm app={app} messages={messages} />
      </div>
    </>
  );
};

export default RevisionPage;
