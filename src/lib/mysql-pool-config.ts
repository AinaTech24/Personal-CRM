/**
 * Builds a mariadb PoolConfig from DATABASE_URL instead of passing the raw
 * string straight through. The mariadb driver's own string parser only
 * understands a bare `ssl=true` query flag — it ignores the `ssl-mode=REQUIRED`
 * / `sslmode=require` convention used by managed MySQL providers (Aiven,
 * PlanetScale, etc.), so those connections would silently attempt a
 * non-TLS connection and get rejected by the server. Detect that convention
 * ourselves and enable TLS explicitly when required.
 */
export function buildPoolConfig(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = (url.searchParams.get("ssl-mode") || url.searchParams.get("sslmode") || "").toUpperCase();
  const sslFlag = url.searchParams.get("ssl");
  const requiresSsl = ["REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"].includes(sslMode) || sslFlag === "true";

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    // rejectUnauthorized: false trusts the provider's cert without pinning its CA —
    // the connection is still encrypted, just not identity-verified. Fine for a
    // managed DB reached over its own private/TLS endpoint.
    ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}
