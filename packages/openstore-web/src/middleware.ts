import { defineMiddleware } from "astro:middleware";

/**
 * Always ensure trailing slashes for all routes (except static assets)
 */
export const onRequest = defineMiddleware((context, next) => {
  const { url, redirect } = context;
  const { pathname, search } = url;

  if (pathname.endsWith("/")) {
    return next();
  }

  // Skip if it looks like a static file with a common extension
  // (allows paths like /app/package.name which aren't files)
  if (/\.(js|css|json|xml|txt|pdf|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|map)$/i.test(pathname)) {
    return next();
  }

  const newPathname = `${pathname}/`;
  const newUrl = `${newPathname}${search}`;

  return redirect(newUrl, 301);
});
