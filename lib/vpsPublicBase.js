function getVpsPublicBaseUrl() {
  return String(
    process.env.SIMLY_PUBLIC_BASE_URL ||
      process.env.VPS_PUBLIC_BASE_URL ||
      "https://singae.cloud"
  )
    .trim()
    .replace(/\/$/, "");
}

module.exports = { getVpsPublicBaseUrl };
