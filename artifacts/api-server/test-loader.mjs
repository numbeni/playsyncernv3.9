import { register } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, basename, resolve as resolvePath } from "node:path";

const extensions = [".ts", ".tsx", ".js", ".jsx"];

function hasExt(specifier) {
  return extname(basename(specifier)) !== "";
}

function isRelative(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

function candidatesFor(basePath) {
  const list = [];
  for (const ext of extensions) {
    list.push(basePath + ext);
  }
  for (const ext of extensions) {
    list.push(resolvePath(basePath, "index" + ext));
  }
  return list;
}

export async function resolve(specifier, context, nextResolve) {
  if (!isRelative(specifier) || hasExt(specifier)) {
    return nextResolve(specifier, context);
  }

  const parentURL = context.parentURL;
  const parentPath = parentURL ? fileURLToPath(parentURL) : process.cwd();
  const basePath = resolvePath(dirname(parentPath), specifier);

  for (const candidate of candidatesFor(basePath)) {
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  return nextResolve(specifier, context);
}

register(import.meta.url);
