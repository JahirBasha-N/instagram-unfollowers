/**
 * Set-based comparison engine for follower/following lists.
 * Uses exactly 2 Sets for all operations — O(n+m) time and space.
 * Optional whitelist param to exclude specific user IDs from results.
 */

export function generateResults(following, followers, whitelist = new Set()) {
  const followerIds = new Set(followers.map((u) => u.id));
  const followingIds = new Set(following.map((u) => u.id));

  const nonFollowers = following.filter((u) => !followerIds.has(u.id) && !whitelist.has(u.id));
  const fans = followers.filter((u) => !followingIds.has(u.id) && !whitelist.has(u.id));
  const mutuals = following.filter((u) => followerIds.has(u.id));

  return {
    nonFollowers,
    fans,
    mutuals,
    stats: {
      followingCount: following.length,
      followersCount: followers.length,
      nonFollowersCount: nonFollowers.length,
      fansCount: fans.length,
      mutualsCount: mutuals.length,
    },
  };
}
