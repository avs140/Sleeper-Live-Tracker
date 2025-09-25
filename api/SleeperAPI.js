// api/sleeperApi.js - Centralized API service
class SleeperAPI {
  constructor() {
    this.baseUrl = 'https://api.sleeper.app/v1';
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
  }

  async fetchWithCache(url, cacheKey = null) {
    const key = cacheKey || url;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.cache.set(key, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error(`API Error for ${url}:`, error);
      throw error;
    }
  }

  async getUser(username) {
    return this.fetchWithCache(`${this.baseUrl}/user/${username}`, `user_${username}`);
  }

  async getNFLState() {
    return this.fetchWithCache(`${this.baseUrl}/state/nfl`, 'nfl_state');
  }

  async getLeague(leagueId) {
    return this.fetchWithCache(`${this.baseUrl}/league/${leagueId}`, `league_${leagueId}`);
  }

  async getLeagueRosters(leagueId) {
    return this.fetchWithCache(`${this.baseUrl}/league/${leagueId}/rosters`, `rosters_${leagueId}`);
  }

  async getLeagueUsers(leagueId) {
    return this.fetchWithCache(`${this.baseUrl}/league/${leagueId}/users`, `users_${leagueId}`);
  }

  async getLeagueMatchups(leagueId, week) {
    return this.fetchWithCache(`${this.baseUrl}/league/${leagueId}/matchups/${week}`, `matchups_${leagueId}_${week}`);
  }

  async getUserLeagues(userId, season) {
    return this.fetchWithCache(`${this.baseUrl}/user/${userId}/leagues/nfl/${season}`, `leagues_${userId}_${season}`);
  }

  async getAllPlayers() {
    return this.fetchWithCache(`${this.baseUrl}/players/nfl`, 'all_players');
  }

  async getPlayerDetails(playerId, season, week) {
    if (!playerId) throw new Error('Player ID is required');

    const allPlayers = await this.getAllPlayers();
    const player = allPlayers[playerId];
    if (!player) throw new Error(`Player not found: ${playerId}`);

    let weekData = {};
    try {
      weekData = await this.getPlayerStats(playerId, season, week) || {};
      console.log(`Player stats for ${player.full_name} (Season ${season}, Week ${week}):`, weekData);
    } catch (err) {
      console.warn(`No stats data for ${playerId}:`, err);
    }

    return {
      player_id: playerId,
      full_name: player.full_name,
      first_name: player.first_name,
      last_name: player.last_name,
      team: player.team,
      position: player.position,
      points: player.points || 0,      // historical total points
      games_played: player.gp || 0,    // historical games played
      week,
      season,
      // Flatten all weekData fields
      ...weekData,
      // Flatten all stats fields directly into root
      ...(weekData.stats || {}),
    };
  }

  async getPlayerDetails(playerId, season, week) {
    if (!playerId) throw new Error('Player ID is required');

    const allPlayers = await this.getAllPlayers();
    const player = allPlayers[playerId];
    if (!player) throw new Error(`Player not found: ${playerId}`);

    let weekData = {};
    try {
      weekData = await this.getPlayerStats(playerId, season, week) || {};
      console.log(`Player stats for ${player.full_name} (Season ${season}, Week ${week}):`, weekData);
    } catch (err) {
      console.warn(`No stats data for ${playerId}:`, err);
    }

    return {
      player_id: playerId,
      full_name: player.full_name,
      first_name: player.first_name,
      last_name: player.last_name,
      team: player.team,
      position: player.position,
      points: player.points || 0,      // historical total points
      games_played: player.gp || 0,    // historical games played
      week,
      season,
      // Flatten all weekData fields
      ...weekData,
      // Flatten all stats fields directly into root
      ...(weekData.stats || {}),
    };
  }

  async getAllPlayerStats(playerIds, season, week) {
  const stats = {};
  for (const id of playerIds) {
    stats[id] = await this.getPlayerStats(id, season, week);
  }
  return stats;
}

  async getPlayerProjections(playerId, season, week) {
    const url = `https://api.sleeper.com/projections/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=week`;
    return this.fetchWithCache(url, `proj_${playerId}_${season}_${week}`);
  }
  async getPlayerStats(playerId, season, week) {
    const url = `https://api.sleeper.com/stats/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=week`;
    const allStats = await this.fetchWithCache(url, `stats_${playerId}_${season}`);

    if (!allStats || typeof allStats !== 'object') return null;

    const weekData = allStats[String(week)];
    if (!weekData || !weekData.stats) return null;

    console.log(`All weekly stats for ${playerId}, week ${week}:`, weekData.stats);

    return weekData.stats; // <-- returns the stats object directly
  }

async getNFLGames(season) {
  try {
    // ESPN scoreboard API (season included as query param if needed)
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    if (!response.ok) throw new Error('Failed to fetch NFL games from ESPN');

    const data = await response.json();

    // Extract relevant info
    const games = data.events.map(event => ({
      id: event.id,
      shortName: event.shortName, // e.g., "SEA @ ARI"
      competitors: event.competitions[0]?.competitors.map(c => ({
        abbreviation: c.team.abbreviation,
        homeAway: c.homeAway
      })) || [],
      status: event.status?.type?.state || 'pre' // 'pre', 'in', 'post'
    }));

    return games;

  } catch (err) {
    console.error(err);
    return [];
  }
}


  clearCache() {
    this.cache.clear();
  }

  // Batch operations for better performance
  async batchPlayerProjections(playerIds, season, week) {
    const projectionPromises = playerIds.map(id =>
      this.getPlayerProjections(id, season, week).catch(err => {
        console.warn(`Failed to get projection for player ${id}:`, err);
        return null;
      })
    );

    return Promise.all(projectionPromises);
  }
}