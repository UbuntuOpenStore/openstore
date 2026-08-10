import { useState, useCallback } from "preact/hooks";
import { getClientApiKey, getRelativeLocaleUrl } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import SvgSpinner from "../icons/Spinner";
import type { AppManageData } from "@/lib/schema";

type DeleteAppProps = {
  app: AppManageData;
  currentLocale: string | undefined;
  messages: {
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

const DeleteApp = ({ app, currentLocale, messages }: DeleteAppProps) => {
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setDeleteError("");
  }, []);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError("");

    try {
      const apiKey = getClientApiKey();
      const url = `${import.meta.env.PUBLIC_API_URL}api/v4/manage/${app.id}?force=true&apikey=${apiKey}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "X-Source": "openstore-web-next",
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        setDialogOpen(false);
        window.location.href = getRelativeLocaleUrl(currentLocale, "/manage/");
      } else {
        const data = await response.json();
        setDeleteError(data.message);
        setDeleting(false);
      }
    } catch (error) {
      setDeleteError(messages.errorOccurred);
      setDeleting(false);
    }
  }, [app, currentLocale, messages]);

  const cancelDelete = useCallback(() => {
    handleCloseDialog();
  }, [handleCloseDialog]);

  return (
    <>
      <button class="btn bg-red-600 text-white font-bold cursor-pointer" onClick={handleOpenDialog}>
        {messages.deleteApp}
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle class="text-red-600">{messages.deleteApplication}</DialogTitle>
          </DialogHeader>

          <div class="py-4">
            {deleteError && (
              <Alert variant="destructive" class="mb-4">
                <AlertTitle>{messages.error}</AlertTitle>
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}

            <p class="mb-4">{messages.areYouSure}</p>
            <p class="text-red-600 mb-4">
              {app.revisions?.length > 0 ? messages.hasRevisionsWarning : messages.cannotBeUndone}
            </p>
          </div>

          <DialogFooter class="flex gap-2">
            <button
              class="btn bg-white text-black font-bold cursor-pointer border border-gray-200"
              onClick={cancelDelete}
              disabled={deleting}
            >
              {messages.cancel}
            </button>
            <button class="btn bg-red-600 text-white font-bold cursor-pointer" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <SvgSpinner class="mr-2 h-4 w-4 animate-spin" />
                  {messages.deleting}
                </>
              ) : (
                messages.confirmDelete
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeleteApp;
