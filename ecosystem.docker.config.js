const { apps: baseApps } = require("./ecosystem.config.cjs");

/** Docker: hub proxies /api/chatbot* -> :13001 (single SQLite writer for chatbot.sqlite) */
const apps = baseApps.map((app) => {
  if (app.name !== "singae-local-hub") return app;
  return {
    ...app,
    env: {
      ...(app.env || {}),
      HUB_CHATBOT_PROXY: "1",
      CHATBOT_ENGINE_URL: process.env.CHATBOT_ENGINE_URL || "http://127.0.0.1:13001"
    }
  };
});

module.exports = { apps };
