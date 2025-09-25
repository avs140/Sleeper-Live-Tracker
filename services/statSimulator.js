// services/statSimulator.js - For development/testing purposes
class statSimulator {
  constructor() {
    this.isSimulating = false;
    this.simulatedStats = new Map(); // player_id -> stats
    this.simulationInterval = null;
    this.playerPositions = new Map(); // player_id -> position
  }

  // Initialize simulator with current player roster
  initializeSimulation(playerData) {
    console.log('🔧 Initializing stat simulator...');
    
    playerData.forEach(data => {
      const { id, player, actualPoints } = data;
      this.playerPositions.set(id, player?.position || 'FLEX');
      
      // Initialize with current actual stats as baseline
      const initialStats = {
        // Passing stats
        pass_cmp: this.getRandomStat(player?.position, 'pass_cmp', 0),
        pass_att: this.getRandomStat(player?.position, 'pass_att', 0),
        pass_yd: this.getRandomStat(player?.position, 'pass_yd', 0),
        pass_td: this.getRandomStat(player?.position, 'pass_td', 0),
        pass_int: this.getRandomStat(player?.position, 'pass_int', 0),
        
        // Rushing stats
        rush_att: this.getRandomStat(player?.position, 'rush_att', 0),
        rush_yd: this.getRandomStat(player?.position, 'rush_yd', 0),
        rush_td: this.getRandomStat(player?.position, 'rush_td', 0),
        
        // Receiving stats
        rec: this.getRandomStat(player?.position, 'rec', 0),
        rec_yd: this.getRandomStat(player?.position, 'rec_yd', 0),
        rec_td: this.getRandomStat(player?.position, 'rec_td', 0),
        
        // Other
        fum: 0,
        fum_lost: 0,
        
        // Meta
        player_id: id,
        season: 2024,
        week: 1
      };

      // Calculate fantasy points based on initial stats
      initialStats.pts_ppr = this.calculateFantasyPoints(initialStats, 'ppr');
      initialStats.pts_half_ppr = this.calculateFantasyPoints(initialStats, 'half_ppr');
      initialStats.pts_std = this.calculateFantasyPoints(initialStats, 'std');

      this.simulatedStats.set(id, initialStats);
    });
  }

  // Get realistic initial stat based on position
  getRandomStat(position, statType, min = 0) {
    const ranges = {
      QB: {
        pass_cmp: [15, 35],
        pass_att: [25, 50], 
        pass_yd: [200, 400],
        pass_td: [1, 4],
        pass_int: [0, 2],
        rush_att: [2, 8],
        rush_yd: [10, 60]
      },
      RB: {
        rush_att: [8, 25],
        rush_yd: [30, 150],
        rush_td: [0, 2],
        rec: [2, 8],
        rec_yd: [10, 80],
        rec_td: [0, 1]
      },
      WR: {
        rec: [3, 12],
        rec_yd: [40, 150],
        rec_td: [0, 2],
        rush_att: [0, 2],
        rush_yd: [0, 20]
      },
      TE: {
        rec: [2, 8],
        rec_yd: [20, 100],
        rec_td: [0, 1]
      }
    };

    const positionRanges = ranges[position];
    if (!positionRanges || !positionRanges[statType]) {
      return min;
    }

    const [rangeMin, rangeMax] = positionRanges[statType];
    return Math.floor(Math.random() * (rangeMax - rangeMin + 1)) + rangeMin;
  }

  // Start simulating incremental stat changes
  startSimulation() {
    if (this.isSimulating) return;
    
    console.log('🎬 Starting live stat simulation...');
    this.isSimulating = true;

    // Update stats every 15-45 seconds
    this.simulationInterval = setInterval(() => {
      this.updateRandomPlayerStats();
    }, Math.random() * 30000 + 15000);
  }

  stopSimulation() {
    console.log('🛑 Stopping stat simulation...');
    this.isSimulating = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  // Randomly update a player's stats
  updateRandomPlayerStats() {
    const playerIds = Array.from(this.simulatedStats.keys());
    if (playerIds.length === 0) return;

    // Pick 1-3 random players to update
    const numPlayers = Math.floor(Math.random() * 3) + 1;
    const selectedPlayers = this.shuffleArray(playerIds).slice(0, numPlayers);

    selectedPlayers.forEach(playerId => {
      const currentStats = this.simulatedStats.get(playerId);
      const position = this.playerPositions.get(playerId);
      
      if (!currentStats || !position) return;

      // Generate realistic stat increments
      const updates = this.generateStatUpdates(position, currentStats);
      
      if (Object.keys(updates).length > 0) {
        // Apply updates
        Object.keys(updates).forEach(statKey => {
          currentStats[statKey] += updates[statKey];
        });

        // Recalculate fantasy points after stat updates
        currentStats.pts_ppr = this.calculateFantasyPoints(currentStats, 'ppr');
        currentStats.pts_half_ppr = this.calculateFantasyPoints(currentStats, 'half_ppr');
        currentStats.pts_std = this.calculateFantasyPoints(currentStats, 'std');

        console.log(`📊 Updated ${playerId} (${position}):`, {
          ...updates,
          newPPR: currentStats.pts_ppr,
          newHalfPPR: currentStats.pts_half_ppr,
          newStd: currentStats.pts_std
        });
        
        this.simulatedStats.set(playerId, currentStats);
      }
    });
  }

  // Generate realistic stat increments based on position
  generateStatUpdates(position, currentStats) {
    const updates = {};

    // Random chance of getting any stats this update (70%)
    if (Math.random() > 0.3) return updates;

    switch (position) {
      case 'QB':
        if (Math.random() < 0.7) {
          const completions = Math.floor(Math.random() * 4) + 1;
          const attempts = completions + Math.floor(Math.random() * 2);
          const yards = completions * (Math.floor(Math.random() * 15) + 5);
          
          updates.pass_cmp = completions;
          updates.pass_att = attempts;
          updates.pass_yd = yards;
          
          // Small chance of TD or INT
          if (Math.random() < 0.15) updates.pass_td = 1;
          if (Math.random() < 0.05) updates.pass_int = 1;
        }
        break;

      case 'RB':
        if (Math.random() < 0.6) {
          const rushes = Math.floor(Math.random() * 3) + 1;
          const yards = rushes * (Math.floor(Math.random() * 8) + 2);
          updates.rush_att = rushes;
          updates.rush_yd = yards;
          
          if (Math.random() < 0.1) updates.rush_td = 1;
        }
        
        // Sometimes receiving stats
        if (Math.random() < 0.4) {
          updates.rec = 1;
          updates.rec_yd = Math.floor(Math.random() * 15) + 5;
        }
        break;

      case 'WR':
        if (Math.random() < 0.6) {
          const catches = Math.floor(Math.random() * 2) + 1;
          const yards = catches * (Math.floor(Math.random() * 20) + 8);
          updates.rec = catches;
          updates.rec_yd = yards;
          
          if (Math.random() < 0.08) updates.rec_td = 1;
        }
        break;

      case 'TE':
        if (Math.random() < 0.5) {
          updates.rec = 1;
          updates.rec_yd = Math.floor(Math.random() * 15) + 6;
          
          if (Math.random() < 0.06) updates.rec_td = 1;
        }
        break;
    }

    return updates;
  }

  // Get simulated stats for a player (replaces real API call)
  getStats(playerId, season, week) {
    if (!this.isSimulating) return null;

    console.log('Getting stats for playerId:', playerId);
  console.log('Current simulated stats keys:', [...this.simulatedStats.keys()]);
    const stats = this.simulatedStats.get(playerId);
    console.log(this.simulatedStats.keys());
    if (!stats) return null;

    // Return a copy with current season/week
    return {
      ...stats,
      season,
      week
    };
  }

  // Utility function
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Toggle simulation on/off
  toggle() {
    if (this.isSimulating) {
      this.stopSimulation();
    } else {
      this.startSimulation();
    }
    return this.isSimulating;
  }

  // Calculate fantasy points based on stats and scoring format
  calculateFantasyPoints(stats, format = 'ppr') {
    let points = 0;

    // Passing stats
    points += (stats.pass_yd || 0) * 0.04; // 1 pt per 25 yards
    points += (stats.pass_td || 0) * 4; // 4 pts per TD
    points -= (stats.pass_int || 0) * 2; // -2 pts per INT

    // Rushing stats
    points += (stats.rush_yd || 0) * 0.1; // 1 pt per 10 yards
    points += (stats.rush_td || 0) * 6; // 6 pts per TD

    // Receiving stats
    points += (stats.rec_yd || 0) * 0.1; // 1 pt per 10 yards
    points += (stats.rec_td || 0) * 6; // 6 pts per TD

    // Reception points based on format
    if (format === 'ppr') {
      points += (stats.rec || 0) * 1; // 1 pt per reception
    } else if (format === 'half_ppr') {
      points += (stats.rec || 0) * 0.5; // 0.5 pts per reception
    }
    // std format gets 0 points for receptions

    // Fumbles
    points -= (stats.fum_lost || 0) * 2; // -2 pts per fumble lost

    return Math.round(points * 100) / 100; // Round to 2 decimal places
  }

  // Clear all simulated data
  reset() {
    this.stopSimulation();
    this.simulatedStats.clear();
    this.playerPositions.clear();
  }

  
}