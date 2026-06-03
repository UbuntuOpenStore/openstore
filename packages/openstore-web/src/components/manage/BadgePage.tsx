import BadgeSelect from "@/components/BadgeSelect";
import ManageHeader from "@/components/manage/ManageHeader";
import ManageError from "./ManageError";
import Loading from "../Loading";
import { useManageApp } from "@/lib/use-manage-app";

type BadgePageProps = {
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
  };
};

const BadgePage = ({ id, currentLocale, messages }: BadgePageProps) => {
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
        breadcrumb={messages.badge}
        currentLocale={currentLocale}
        messages={{
          manage: messages.manage,
          edit: messages.edit,
          newRevision: messages.newRevision,
          stats: messages.stats,
          badge: messages.badge,
        }}
      />

      <section class="section mb-8 grow">
        <h2 class="text-2xl">{messages.badge}</h2>

        <div class="w-full mt-4">
          <BadgeSelect appId={app.id} currentLocale={currentLocale} />
        </div>
      </section>
    </>
  );
};

export default BadgePage;
