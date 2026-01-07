import { defineMiddleware } from "astro:middleware";

/**
 * Always ensure trailing slashes for /app and /manage routes
 */
export const onRequest = defineMiddleware((context, next) => {
  const { url, redirect } = context;
  const { pathname, search } = url;

  if (
    !pathname.endsWith("/") &&
    (pathname.startsWith("/app") || pathname.startsWith("/manage"))
  ) {
    const newPathname = `${pathname}/`;
    const newUrl = `${newPathname}${search}`;

    return redirect(newUrl, 301);
  }


  return next();

});
