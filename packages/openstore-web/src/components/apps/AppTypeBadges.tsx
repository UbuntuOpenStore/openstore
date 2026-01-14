import { AppType, type AppData } from "@/lib/schema";

const ALL_TYPES: string[] = [AppType.APP, AppType.BOOKMARK, AppType.WEBAPP];

type AppTypeBadgesProps = {
  types: AppData['types'],
  packageType: AppData['package_type'],
  publishedDate?: string,
  messages: { new: string, app: string, bookmark: string, webapp: string }
};

const AppTypeBadges = ({ types, packageType, publishedDate, messages }: AppTypeBadgesProps) => {
  let isNew = false;

  if (publishedDate) {
    const published = new Date(publishedDate);
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 30);
    isNew = published.getTime() > checkDate.getTime();
  }

  return (
    <div class="mt-1 space-x-1">
      {isNew && (
        <span class="rounded-lg bg-ubuntu-orange text-white px-1.5 py-1 text-xs">
          {messages.new}
        </span>
      )}

      {packageType !== 'click' && (
        <span class="rounded-lg bg-ubuntu-purple text-white px-1.5 py-1 text-xs">
          {packageType.charAt(0).toUpperCase() + packageType.slice(1)}
        </span>
      )}

      {types.filter((type) => ALL_TYPES.includes(type)).map((type) => (
        <span class="rounded-lg bg-primary text-white px-1.5 py-1 text-xs">
          {type === AppType.APP && (<>{messages.app}</>)}
          {type === AppType.BOOKMARK && (<>{messages.bookmark}</>)}
          {type === AppType.WEBAPP && (<>{messages.webapp}</>)}
        </span>
      ))}
    </div>
  )
};

export default AppTypeBadges;
