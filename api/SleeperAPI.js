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