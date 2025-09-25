// services/matchupService.js - Core matchup logic
class MatchupService {
  constructor(api) {
    this.api = api;
    this.scoringCalculator = new ScoringCalculator();
    this.previousPlayerStats = {}; // <-- store last known stats
    this.previousPlayerPoints = {}; // <-- store last known points
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


  async calculateProjectionsForRoster(roster, matchup, league, allPlayers, season, week) {
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
      const isGameOver = this.isPlayerGameOver(player, actualPoints);

      // Compute projected points
      let projectedPoints = 0;
      if (projectionData && projectionData[week]) {
        projectedPoints = this.scoringCalculator.calculateProjectedPoints(
          projectionData[week].stats,
          league.scoring_settings,
          player
        );
      }

      if (isGameOver) totalActual += actualPoints;
      else totalProjected += projectedPoints;

      // Compute stat deltas
      const currentStats = playerStatsData[playerId] || {};
      const previousStats = this.previousPlayerStats[playerId] || {};
      const statDeltas = {};

      for (const [stat, value] of Object.entries(currentStats)) {
        const delta = (value || 0) - (previousStats[stat] || 0);
        if (delta !== 0) statDeltas[stat] = delta;
      }

      this.previousPlayerStats[playerId] = { ...currentStats };
      this.previousPlayerPoints[playerId] = actualPoints;

      playerData.push({
        id: playerId,
        player,
        actualPoints,
        projectedPoints,
        position: league.roster_positions?.[i] || 'FLEX',
        isGameOver,
        detailedStats: statDeltas
      });
    }

    return {
      totalActual,
      totalProjected,
      totalCombined: totalActual + totalProjected,
      playerData
    };
  }

  isPlayerGameOver(player, actualPoints) {
    return actualPoints > 0 || player?.status === 'Inactive' || player?.status === 'OUT';
  }

  calculateWinProbability(myTotal, opponentTotal) {
    if (myTotal + opponentTotal === 0) return 50;

    // Use exponential weighting to make the probability more dramatic
    const weightFactor = 10;
    const myWeighted = Math.pow(myTotal * 0.8, weightFactor); // Slight discount for uncertainty
    const opponentWeighted = Math.pow(opponentTotal * 0.8, weightFactor);

    return (myWeighted / (myWeighted + opponentWeighted)) * 100;
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