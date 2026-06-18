function getConfiguredRanks(guildConfig) {
  if (!guildConfig || !Array.isArray(guildConfig.ranks)) return [];
  return sortRanksByOrder(guildConfig.ranks);
}

function getMemberRank(member, guildConfig) {
  if (!member?.roles?.cache) return null;

  const ranks = getConfiguredRanks(guildConfig);
  const memberRoleIds = member.roles.cache.map((role) => role.id);
  const matchedRanks = ranks.filter((rank) => memberRoleIds.includes(rank.rankRoleId));

  if (matchedRanks.length === 0) return null;

  // Rank order convention: higher `order` (or legacy `level`) means a higher rank.
  matchedRanks.sort((a, b) => getRankOrder(b) - getRankOrder(a));
  return matchedRanks[0];
}

function getRankByName(arg1, arg2) {
  const { guildConfig, rankName } = normalizeConfigAndValue(arg1, arg2);
  if (!rankName) return null;

  return getConfiguredRanks(guildConfig).find((rank) => {
    return rank.name?.toLowerCase() === String(rankName).toLowerCase();
  }) || null;
}

function getRankByRoleId(guildConfig, roleId) {
  if (!roleId) return null;
  return getConfiguredRanks(guildConfig).find((rank) => rank.rankRoleId === roleId) || null;
}

function getRankByLevel(level, guildConfig) {
  return getConfiguredRanks(guildConfig).find((rank) => getRankOrder(rank) === level) || null;
}

function sortRanksByOrder(ranks) {
  if (!Array.isArray(ranks)) return [];
  return ranks.slice().sort((a, b) => getRankOrder(a) - getRankOrder(b));
}

function getHigherRanks(arg1, arg2) {
  const { guildConfig, currentRank } = normalizeConfigAndRank(arg1, arg2);
  if (!currentRank) return [];
  return getConfiguredRanks(guildConfig).filter((rank) => getRankOrder(rank) > getRankOrder(currentRank));
}

function getLowerRanks(arg1, arg2) {
  const { guildConfig, currentRank } = normalizeConfigAndRank(arg1, arg2);
  if (!currentRank) return [];
  return getConfiguredRanks(guildConfig)
    .filter((rank) => getRankOrder(rank) < getRankOrder(currentRank))
    .sort((a, b) => getRankOrder(b) - getRankOrder(a));
}

function getNextHigherRanks(currentRank, guildConfig) {
  return getHigherRanks(guildConfig, currentRank);
}

function getNextLowerRanks(currentRank, guildConfig) {
  return getLowerRanks(guildConfig, currentRank);
}

function getRankOrder(rank) {
  if (!rank) return 0;
  if (Number.isFinite(rank.order)) return rank.order;
  if (Number.isFinite(rank.level)) return rank.level;
  return 0;
}

function normalizeConfigAndValue(arg1, arg2) {
  if (typeof arg1 === 'string') {
    return { rankName: arg1, guildConfig: arg2 };
  }
  return { guildConfig: arg1, rankName: arg2 };
}

function normalizeConfigAndRank(arg1, arg2) {
  if (arg1 && Array.isArray(arg1.ranks)) {
    return { guildConfig: arg1, currentRank: arg2 };
  }
  return { currentRank: arg1, guildConfig: arg2 };
}

module.exports = {
  getConfiguredRanks,
  getMemberRank,
  getRankByName,
  getRankByRoleId,
  sortRanksByOrder,
  getHigherRanks,
  getLowerRanks,
  getRankByLevel,
  getNextHigherRanks,
  getNextLowerRanks
};
