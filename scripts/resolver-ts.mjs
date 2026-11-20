export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e && e.code === "ERR_MODULE_NOT_FOUND" && /^\.{1,2}\//.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw e;
  }
}
