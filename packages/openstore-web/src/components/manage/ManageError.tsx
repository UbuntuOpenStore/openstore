import SvgClose from "../icons/Close";

type ManageErrorProps = {
  status: number;
  messages: {
    notFound: string;
    forbidden: string;
    unauthorized: string;
    badRequest: string;
    serverError: string;
  };
};

const ManageError = ({ status, messages }: ManageErrorProps) => {
  return (
    <section class="section">
      <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
        <SvgClose class="text-red-600" />
        <p>
          {status === 404 && messages.notFound}
          {status === 403 && messages.forbidden}
          {status === 401 && messages.unauthorized}
          {status === 400 && messages.badRequest}
          {status > 500 && messages.serverError}
        </p>
      </div>
    </section>
  );
};

export default ManageError;
