function cleanDisplayName(displayName, patterns = []) {
  let cleanName = String(displayName || '').trim();

  for (const pattern of patterns) {
    try {
      cleanName = cleanName.replace(new RegExp(pattern), '').trim();
    } catch (error) {
      console.warn(`Invalid registration callsign pattern ignored: ${pattern}`, error);
    }
  }

  return cleanName || String(displayName || '').trim();
}

function getRankKey(rank) {
  if (!rank) return null;
  if (rank.key) {
    return String(rank.key)
      .trim()
      .toLowerCase();
  }

  return String(rank.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getRankName(rank) {
  return rank?.rankName || rank?.name || 'Unknown';
}

function rankRequiresEmail(rank, config) {
  const requiredRankKeys = config?.registration?.emailRequiredRankKeys || [];
  const rankKey = getRankKey(rank);

  return Boolean(rankKey && requiredRankKeys.includes(rankKey));
}

function canRegisterOther(member, config) {
  const permissionRoleIds = config?.registration?.registerOtherPermissionRoleIds || [];

  if (!member?.roles?.cache || permissionRoleIds.length === 0) {
    return false;
  }

  return permissionRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function buildRegistrationPayload({
  interaction,
  targetMember,
  mode,
  cleanName,
  detectedRank,
  joinDate,
  steam64,
  email,
  emailRequired,
  departmentKey
}) {
  const rankKey = getRankKey(detectedRank);
  const rankName = getRankName(detectedRank);

  return {
    departmentKey,
    actionType: 'REGISTER_OFFICER',
    source: 'DISCORD_BOT',
    submittedByDiscordId: interaction.user.id,
    submittedByDiscordTag: interaction.user.tag,
    targetDiscordId: targetMember.id,
    targetDiscordTag: targetMember.user.tag,
    discordUserId: targetMember.id,
    discordId: targetMember.id,
    targetName: cleanName,
    upsertByDiscordId: true,
    payload: {
      registerMode: mode,
      cleanDisplayName: cleanName,
      discordUserId: targetMember.id,
      discordId: targetMember.id,
      upsertLookupKey: 'DiscordUserId',
      discordDisplayName: targetMember.displayName,
      discordUsername: targetMember.user.username,
      discordTag: targetMember.user.tag,
      rankKey,
      rankName,
      joinDate,
      steam64,
      email,
      emailRequired,
      registeredByDiscordId: interaction.user.id,
      registeredByDiscordTag: interaction.user.tag,
      registeredAt: new Date().toISOString()
    }
  };
}

function validateRegistrationFields({ joinDate, steam64, email, emailRequired }) {
  const errors = [];

  if (!joinDate) {
    errors.push('Join Date is required.');
  }

  if (!steam64) {
    errors.push('Steam 64 is required.');
  } else if (!/^\d{15,20}$/.test(steam64)) {
    errors.push('Steam 64 should be numeric and at least 15 digits long.');
  }

  if (emailRequired && !email) {
    errors.push('Email is required for this rank.');
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Email must look like a valid email address.');
  }

  return errors;
}

module.exports = {
  cleanDisplayName,
  getRankKey,
  getRankName,
  rankRequiresEmail,
  canRegisterOther,
  buildRegistrationPayload,
  validateRegistrationFields
};
