const {
  readEnrichedSenderProfile,
  fetchMessengerProfileFromVps,
  canFetchFromVps
} = require("../../lib/vpsMessengerProfile");
const { getFacebookUserProfile } = require("./facebookMessenger");
const { appendServerLog } = require("./serverLogs");

function isFacebookFallbackParticipantLabel(label, senderId = "") {
  const text = String(label || "").trim();
  if (!text) return true;
  const sid = String(senderId || "").trim();
  if (sid && text === `Facebook User ${sid}`) return true;
  return /^Facebook User \d{5,}$/i.test(text);
}

function messengerProfileToPatch(profile) {
  if (!profile || typeof profile !== "object") return null;
  const first = String(profile.firstName || profile.first_name || "").trim();
  const last = String(profile.lastName || profile.last_name || "").trim();
  const name =
    String(profile.name || profile.displayName || "")
      .trim()
      .replace(/\s+/g, " ") ||
    [first, last].filter(Boolean).join(" ").trim() ||
    null;
  const avatarUrl = String(profile.avatarUrl || profile.profile_pic || "").trim() || null;
  if (!name && !avatarUrl && !first && !last) return null;
  return {
    name: name || null,
    displayName: name || null,
    avatarUrl,
    givenName: first || null,
    familyName: last || null,
    gender: profile.gender || null,
    facebookLocale: profile.locale || null,
    facebookTimezone:
      profile.timezone == null || profile.timezone === ""
        ? null
        : Number.isFinite(Number(profile.timezone))
          ? Number(profile.timezone)
          : null
  };
}

function pickDisplayName({ profile, senderId, existingLabel = "" }) {
  const patch = messengerProfileToPatch(profile);
  const fromProfile = String(patch?.name || patch?.displayName || "").trim();
  if (fromProfile) return fromProfile;
  const existing = String(existingLabel || "").trim();
  if (existing && !isFacebookFallbackParticipantLabel(existing, senderId)) return existing;
  const sid = String(senderId || "").trim();
  return sid ? `Facebook User ${sid}` : "Facebook User";
}

function mergeMessengerProfiles(...profiles) {
  let best = null;
  for (const raw of profiles) {
    const patch = messengerProfileToPatch(raw);
    if (!patch) continue;
    if (!best) {
      best = patch;
      continue;
    }
    best = {
      ...best,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== "")),
      name: best.name || patch.name,
      displayName: best.displayName || patch.displayName,
      avatarUrl: best.avatarUrl || patch.avatarUrl
    };
  }
  return best;
}

/**
 * Lấy tên + avatar người gửi Messenger (PSID).
 * Thứ tự: webhook enrich (_singaeSenderProfile) → VPS Graph → local Graph (đúng Page token).
 */
async function resolveFacebookSenderProfile({
  senderId,
  pageId,
  pageAccessToken,
  rawEvent,
  existingProfile = null,
  existingLabel = ""
}) {
  const sid = String(senderId || "").trim();
  const pid = String(pageId || "").trim();
  const existingName = String(
    existingProfile?.name || existingProfile?.displayName || existingLabel || ""
  ).trim();
  const existingIsFallback = isFacebookFallbackParticipantLabel(existingName, sid);

  const enriched = readEnrichedSenderProfile(rawEvent);
  const enrichedPatch = messengerProfileToPatch(enriched);
  let merged = enrichedPatch;

  const shouldFetch =
    !enrichedPatch?.name || !enrichedPatch?.avatarUrl || existingIsFallback;

  if (shouldFetch && sid && pid) {
    const attempts = [];
    if (canFetchFromVps()) {
      attempts.push(
        fetchMessengerProfileFromVps(pid, sid).catch((err) => {
          return { __error: err?.message || "vps profile failed" };
        })
      );
    }
    if (String(pageAccessToken || "").trim()) {
      attempts.push(
        getFacebookUserProfile(sid, pageAccessToken).catch((err) => {
          return { __error: err?.message || "local graph profile failed" };
        })
      );
    }

    const results = await Promise.all(attempts);
    const profiles = [enriched, ...results.filter((r) => r && !r.__error)];
    merged = mergeMessengerProfiles(...profiles);

    if (!merged?.name && !merged?.avatarUrl) {
      const errors = results.map((r) => r?.__error).filter(Boolean);
      appendServerLog({
        level: "info",
        source: "facebook-sender-profile",
        message: "Không lấy được profile Messenger (Graph trả rỗng hoặc lỗi)",
        metadata: {
          senderId: sid,
          pageId: pid,
          hasPageToken: Boolean(String(pageAccessToken || "").trim()),
          canFetchFromVps: canFetchFromVps(),
          errors: errors.length ? errors : undefined
        }
      });
    }
  }

  const displayName = pickDisplayName({
    profile: merged,
    senderId: sid,
    existingLabel: existingName
  });

  return {
    patch: merged,
    displayName,
    senderName: merged?.name || (isFacebookFallbackParticipantLabel(displayName, sid) ? null : displayName),
    avatarUrl: merged?.avatarUrl || null,
    gender: merged?.gender || null,
    givenName: merged?.givenName || null,
    familyName: merged?.familyName || null,
    facebookLocale: merged?.facebookLocale || null,
    facebookTimezone: merged?.facebookTimezone ?? null
  };
}

module.exports = {
  isFacebookFallbackParticipantLabel,
  messengerProfileToPatch,
  pickDisplayName,
  resolveFacebookSenderProfile
};
