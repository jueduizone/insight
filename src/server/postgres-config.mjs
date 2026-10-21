/** @param {string | undefined} connectionString */
export function postgresConfig(connectionString) {
  if (!connectionString) {
    return {
      connectionString,
      ssl: { rejectUnauthorized: true },
      options: "-c search_path=insight,public",
      enableChannelBinding: true,
    };
  }

  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("The database connection must use PostgreSQL");
  }

  // pg merges URL parameters over the config object. Normalize both together
  // so neither TLS verification nor schema isolation can be overridden by a URL.
  const host = url.searchParams.get("host") || url.hostname;
  const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
  for (const key of [
    "ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "options",
  ]) {
    url.searchParams.delete(key);
  }

  return {
    connectionString: url.toString(),
    ssl: isLoopback ? false : { rejectUnauthorized: true },
    options: "-c search_path=insight,public",
    enableChannelBinding: true,
  };
}
