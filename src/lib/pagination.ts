/** Parses & clamps `take`/`skip` query params for a paginated list endpoint. */
export function parsePageParams(
  params: URLSearchParams,
  opts?: { defaultTake?: number; maxTake?: number }
): { take: number; skip: number } {
  const defaultTake = opts?.defaultTake ?? 50;
  const maxTake = opts?.maxTake ?? 200;
  const take = Math.min(Math.max(Number(params.get("take")) || defaultTake, 1), maxTake);
  const skip = Math.max(Number(params.get("skip")) || 0, 0);
  return { take, skip };
}
