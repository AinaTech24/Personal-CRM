import { NextResponse } from "next/server";
import { hasAnyRole, type Actor } from "./access";
import { getActor } from "./actor";
import { tableBySlug } from "./catalog";
import { HttpError } from "./engine";

/** Runs a Command Centre API handler for the signed-in user, mapping failures to JSON errors. */
export async function withActor(fn: (actor: Actor) => Promise<Response>): Promise<Response> {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasAnyRole(actor)) return NextResponse.json({ error: "You don't have a Command Centre role." }, { status: 403 });
    return await fn(actor);
  } catch (e) {
    return errorResponse(e);
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details ?? [] }, { status: e.status });
  const code = (e as { code?: string }).code;
  if (code === "P2002") return NextResponse.json({ error: "That would duplicate an existing record (a unique value is already in use)." }, { status: 409 });
  if (code === "P2034") return NextResponse.json({ error: "Another change landed at the same time. Try again." }, { status: 409 });
  console.error("[command centre]", e);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export function tableOf(slug: string) {
  const t = tableBySlug(slug);
  if (!t) throw new HttpError(404, "Unknown resource");
  return t.table;
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Expected a JSON object body.");
  }
}
