// services/matchupService.js - Core matchup logic
class MatchupService {
  constructor(api) {
    this.api = api;
    this.scoringCalculator = new ScoringCalculator();
    this.previousPlayerStats = {}; // <-- store last known stats
    this.previousPlayerPoints = {}; // <-- store last known points
    this.winProbCache = {}; // <-- in-memory cache
    this.restoreCache();

  }

  async restoreCache() {
    const result = await chrome.storage.local.get(null); // load all keys
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith("winProb_")) {
        this.winProbCache[key.replace("winProb_", "")] = value;
      }
    }
  }

  async setCachedWinProb(matchupId, value) {
    const entry = { value, timestamp: Date.now() };
    this.winProbCache[matchupId] = entry;

    // Persist to chrome.storage.local
    await chrome.storage.local.set({ [`winProb_${matchupId}`]: entry });
  }

  async getCachedWinProb(matchupId) {
    // First check memory
    if (this.winProbCache[matchupId]) {
      return this.winProbCache[matchupId];
    }

    // Fallback to chrome.storage.local
    const result = await chrome.storage.local.get(`winProb_${matchupId}`);
    return result[`winProb_${matchupId}`] ?? null;
  }
  async calculateLiveWinProbabilityCached(
    matchupId,
    myScore,
    myRemainingProj,
    myRoster,
    oppScore,
    oppRemainingProj,
    oppRoster,
    allPlayers,
    games,
    sims = 1000,
    volatility = 25
  ) {
    const now = Date.now();
     const cached = await this.getCachedWinProb(matchupId);
    
    const anyLiveGame = myRoster.concat(oppRoster).some(playerId => {
      const player = allPlayers[playerId];
      if (!player) return false;
      let team = player.team.toUpperCase();
      if (team === 'WAS') team = 'WSH';
      const game = games.find(g => {
        return g.shortName?.toUpperCase().includes(team);
      });
      return game?.status === 'in';
    });

    // Always prefer cache if no games are live
    if (!anyLiveGame && cached) {
      return cached.value;
    }

    // Only use timestamp if games are live
    if (cached && now - cached.timestamp < 60_000) {
      return cached.value;
    }



    const winProb = this.calculateWinProbabilityLive(
      myScore,
      myRemainingProj,
      this.calculateRosterGameProgress(myRoster, allPlayers, games),
      oppScore,
      oppRemainingProj,
      this.calculateRosterGameProgress(oppRoster, allPlayers, games),
      sims,
      volatility
    )
    // Cache as number
    await this.setCachedWinProb(matchupId, winProb);

    return winProb;
  }


  createUserMap(users) {
    return users.reduce((map, user) => {
      map[user.user_id] = user.metadata?.team_name || user.display_name || 'Unnamed Team';
      return map;
    }, {});
  }

  async getMatchupData(username, leagueId) {
    try {
      // Fetch all required data in parallel
      const [user, nflState, league, rosters, users, allPlayers] = await Promise.all([
        this.api.getUser(username),
        this.api.getNFLState(),
        this.api.getLeague(leagueId),
        this.api.getLeagueRosters(leagueId),
        this.api.getLeagueUsers(leagueId),
        this.api.getAllPlayers()
      ]);

      const { season, week } = nflState;
      const matchups = await this.api.getLeagueMatchups(leagueId, week);

      // Create user map for team names
      const userMap = this.createUserMap(users);

      // Find user's roster and matchup
      const myRoster = rosters.find(r => r.owner_id === user.user_id);
      if (!myRoster) throw new Error('User roster not found in league');

      const myMatchup = matchups.find(m => m.roster_id === myRoster.roster_id);
      if (!myMatchup) throw new Error('No matchup found for current week');

      // Find opponent
      const opponentMatchup = matchups.find(m =>
        m.matchup_id === myMatchup.matchup_id &&
        m.roster_id !== myRoster.roster_id
      );
      if (!opponentMatchup) throw new Error('Opponent matchup not found');

      const opponentRoster = rosters.find(r => r.roster_id === opponentMatchup.roster_id);
      if (!opponentRoster) throw new Error('Opponent roster not found');

      return {
        league,
        season,
        week,
        myRoster,
        opponentRoster,
        myMatchup,
        opponentMatchup,
        userMap,
        allPlayers
      };
    } catch (error) {
      console.error('Error fetching matchup data:', error);
      throw error;
    }
  }


  async calculateProjectionsForRoster(roster, matchup, league, allPlayers, season, week, games) {
    const playerIds = matchup.starters || [];
    const projections = await this.api.batchPlayerProjections(playerIds, season, week);
    const playerStatsData = await this.api.getAllPlayerStats(playerIds, season, week);

    let totalProjected = 0;
    let totalActual = 0;
    const playerData = [];

    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const player = allPlayers[playerId];
      const actualPoints = matchup.players_points?.[playerId] || 0;
      const projectionData = projections[i];


      // Compute projected points
      let projectedPoints = 0;
      if (projectionData && projectionData[week]) {
        projectedPoints = this.scoringCalculator.calculateProjectedPoints(
          projectionData[week].stats,
          league.scoring_settings,
          player
        );
      }

      totalActual += actualPoints * this.PlayerGameCompletionAmount(player, games, true);
      totalProjected += projectedPoints * this.PlayerGameCompletionAmount(player, games, false)


      // Compute stat deltas
      const currentStats = playerStatsData[playerId] || {};

      playerData.push({
        id: playerId,
        player,
        actualPoints,
        projectedPoints,
        position: league.roster_positions?.[i] || 'FLEX',
        detailedStats: currentStats
      });
    }

    return {
      totalActual,
      totalProjected,
      totalCombined: totalActual + totalProjected,
      playerData
    };
  }



  PlayerGameCompletionAmount(player, games, actualPts = true) {
    if (!player) return 0;
    let team = player.team.toUpperCase();
    // Hardcode the Washington mismatch
    if (team === 'WAS') team = 'WSH';
    const game = games.find(g => {
      return g.shortName?.toUpperCase().includes(team);
    });

    if (!game) return 0;

    const state = game.status;

    if (actualPts) {
      if (state === "pre") return 0;
      if (state === "in") return 0.5;
      if (state === "post") return 1;
    } else {
      if (state === "pre") return 1;
      if (state === "in") return 0.5;
      if (state === "post") return 0;
    }

    return 0;
  }

  calculateWinProbabilityLive(
    myScore,
    myRemainingProj,
    myGameProgress,
    oppScore,
    oppRemainingProj,
    oppGameProgress,
    sims = 1000,
    sd = 3
  ) {
    let wins = 0;

    const myProjRemaining = myRemainingProj * (1 - myGameProgress);
    const oppProjRemaining = oppRemainingProj * (1 - oppGameProgress);

    for (let i = 0; i < sims; i++) {
      const myTotal = myScore + this.randomNormal(myProjRemaining, sd);
      const oppTotal = oppScore + this.randomNormal(oppRemainingProj, sd);
      if (myTotal > oppTotal) wins++;
    }

    return (wins / sims) * 100;
  }

  // Standard normal random generator
  randomNormal(mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  calculateRosterGameProgress(roster, allPlayers, games) {
    const starters = roster.starters || [];
    if (!starters.length) return 0;

    let totalProgress = 0;
    let countedPlayers = 0;

    for (const playerId of starters) {
      const player = allPlayers[playerId];
      if (!player) continue;

      let team = player.team.toUpperCase();
      // Hardcode the Washington mismatch
       if (team === 'WAS') team = 'WSH';
      const game = games.find(g => {
        return g.shortName?.toUpperCase().includes(team);
      });

      if (!game) return 0;

      const state = game.status;

      let progress = 0;
      if (state === "pre") progress = 0;
      if (state === "in") progress = .5;
      else if (state === "post") progress = 1;

      totalProgress += progress;
      countedPlayers++;
    }

    if (countedPlayers === 0) return 0;

    return (totalProgress / countedPlayers); // 0–1 float
  }



}

// Separate scoring calculation logic
class ScoringCalculator {
  calculateProjectedPoints(stats, scoringSettings, player) {
    let points = 0;

    // Determine scoring format
    if (scoringSettings?.rec === 1) {
      points = stats.pts_ppr || 0;
    } else if (scoringSettings?.rec === 0.5) {
      points = stats.pts_half_ppr || 0;
    } else {
      points = stats.pts_std || 0;
    }

    // Add TE bonus if applicable
    const teBonus = scoringSettings?.bonus_rec_te || 0;
    if (player?.position === 'TE' && teBonus && stats.rec) {
      points += teBonus * stats.rec;
    }

    return points;
  }

  getPlayerStatusClass(player) {
    const status = player?.injury_status || 'ACTIVE';
    switch (status) {
      case 'Active':
      case 'ACTIVE':
        return 'active';
      case 'OUT':
      case 'Inactive':
        return 'out';
      case 'IR':
        return 'out';
      case 'Questionable':
        return 'questionable';
      default:
        return '';
    }
  }
}