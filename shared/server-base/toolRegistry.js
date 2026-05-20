const path = require("path");

function resolveFromRoot(...parts) {
  return path.join(__dirname, "..", "..", ...parts);
}

const toolTags = {
  "ai-manager": "vip",
  "chatbot-manager": "vip",
  "db-viewer": "vip",
  "singae-lookup": "normal",
  "user-admin": "normal",
  giftbag: "normal",
  commission: "normal",
  "commission-settings": "normal",
  chatbot: "normal",
  "it-support": "normal",
  "payroll-calculator": "normal"
};

const staticMounts = [
  { route: "/tools/vip/db-viewer", dir: resolveFromRoot("tools", "db-viewer", "ui") },
  { route: "/tools/ai/chatbot", dir: resolveFromRoot("chatbot", "ui") },
  { route: "/tools/ai/singae-lookup", dir: resolveFromRoot("tools", "singae-lookup", "ui") },
  { route: "/tools/normal/user-admin", dir: resolveFromRoot("tools", "user-admin", "ui") },
  { route: "/tools/vip/ai-manager", dir: resolveFromRoot("tools", "ai-manager", "ui") },
  { route: "/tools/vip/chatbot-manager", dir: resolveFromRoot("tools", "chatbot-manager", "ui") },
  { route: "/tools/normal/giftbag", dir: resolveFromRoot("tools", "giftbag", "ui") },
  { route: "/tools/normal/commission", dir: resolveFromRoot("tools", "commission", "ui") },
  { route: "/tools/normal/commission-settings", dir: resolveFromRoot("tools", "commission-settings", "ui") },
  // it-support is now a standalone cloned app (Next export at frontend/out)
  { route: "/tools/normal/it-support", dir: resolveFromRoot("tools", "it-support", "frontend", "out") },
  { route: "/tools/normal/payroll-calculator", dir: resolveFromRoot("tools", "payroll-calculator", "ui") },
  { route: "/tools/default", dir: resolveFromRoot("tools", "windowsshell", "ui", "default") },
  { route: "/tools/code", dir: resolveFromRoot("tools", "windowsshell", "ui", "code") },
  { route: "/tools/image", dir: resolveFromRoot("tools", "windowsshell", "ui", "image") }
];

module.exports = {
  toolTags,
  staticMounts
};
