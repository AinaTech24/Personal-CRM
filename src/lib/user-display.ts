/**
 * How a user's name is shown in pickers across the app.
 *
 * Assignment is no longer department-scoped — every dropdown lists everyone —
 * so admins and super admins are badged in the label to tell them apart from
 * ordinary members at a glance. Regular users get no suffix.
 */

export type RoleLike = "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER" | string | null | undefined;

/** "Super Admin" / "Admin" for elevated roles, null for everyone else. */
export function roleLabel(role: RoleLike): string | null {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMIN") return "Admin";
  return null;
}

/** Full name, surname included when present. */
export function userDisplayName(u: { name: string; surname?: string | null }): string {
  return u.surname ? `${u.name} ${u.surname}` : u.name;
}

/** "Ana Rao (Admin)" — full name with a role badge for admins and super admins. */
export function userOptionLabel(u: { name: string; surname?: string | null; role?: RoleLike }): string {
  const base = userDisplayName(u);
  const r = roleLabel(u.role);
  return r ? `${base} (${r})` : base;
}
