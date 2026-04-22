import { useState, useCallback } from "preact/hooks";
import { getClientApiKey } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import SvgSpinner from "../icons/Spinner";
import type { AppManageData } from "@/lib/schema";

const DeleteApp = ({ app }: { app: AppManageData }) => {
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
      const url = `${import.meta.env.PUBLIC_API_URL}api/v3/manage/${app.id}?force=true&apikey=${apiKey}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "X-Source": "openstore-web-next",
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        setDialogOpen(false);
        window.location.href = "/manage/";
      } else {
        const data = await response.json();
        setDeleteError(data.message || "Failed to delete app");
        setDeleting(false);
      }
    } catch (error) {
      setDeleteError("An error occurred while deleting the app");
      setDeleting(false);
    }
  }, [app]);

  const cancelDelete = useCallback(() => {
    handleCloseDialog();
  }, [handleCloseDialog]);

  return (
    <>
      <button class="btn bg-red-600 text-white font-bold cursor-pointer" onClick={handleOpenDialog}>
        Delete App
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle class="text-red-600">Delete Application</DialogTitle>
          </DialogHeader>

          <div class="py-4">
            {deleteError && (
              <Alert variant="destructive" class="mb-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}

            <p class="mb-4">Are you sure you want to delete this app?</p>
            <p class="text-red-600 mb-4">
              {app.revisions?.length > 0
                ? "This app has revisions which will also be deleted. This action cannot be undone."
                : "This action cannot be undone."}
            </p>
          </div>

          <DialogFooter class="flex gap-2">
            <button
              class="btn bg-white text-black font-bold cursor-pointer border border-gray-200"
              onClick={cancelDelete}
              disabled={deleting}
            >
              Cancel
            </button>
            <button class="btn bg-red-600 text-white font-bold cursor-pointer" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <SvgSpinner class="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Confirm Delete"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeleteApp;
