import { fetchDetail, replay } from "./api";
import { toCurl } from "./curl";
import type { FlowMeta } from "./types";

/** The URL as the user sees it, independent of the detail fetch. */
export const urlFor = (f: FlowMeta): string => `${f.scheme}://${f.host}${f.path}`;

export async function copyUrl(f: FlowMeta): Promise<void> {
  await navigator.clipboard.writeText(urlFor(f));
}

/** cURL needs headers and the body, which only the detail endpoint carries. */
export async function copyCurl(f: FlowMeta): Promise<void> {
  const detail = await fetchDetail(f.id);
  await navigator.clipboard.writeText(toCurl(detail));
}

export const replayFlow = (f: FlowMeta): Promise<unknown> => replay(f.id);
