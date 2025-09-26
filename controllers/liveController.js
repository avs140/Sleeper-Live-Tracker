// controllers/liveController.js - Live scoring page logic
class LiveController {
  constructor() {
    this.api = new SleeperAPI();

    // this.api.getAllPlayerStats = async (playerIds, season, week) => {
    //   const fakeStats = {};
    //   for (const id of playerIds) {
    //     fakeStats[id] = {
    //       pass_yd: 0,
    //       pass_td: 0,
    //       rush_yd: 0,
    //       rush_td: 0,
    //       rec: 1,
    //       rec_yd: 30,
    //       rec_td: 1,
    //       fum: 0,
    //     };
    //   }
    //   return fakeStats;
    // };

    // this.api.getPlayerStats = async (playerId, season, week) => {
    //   return {
    //       pass_yd: 0,
    //       pass_td: 0,
    //       rush_yd: 0,
    //       rush_td: 0,
    //       rec: 1,
    //       rec_yd: 30,
    //       rec_td: 1,
    //       fum: 0,
    //   };
    // };


    this.matchupService = new MatchupService(this.api);
    this.scoringFeed = new ScoringFeed();
    this.storage = this.getStorageAPI();

    this.updateInterval = null;
    this.isInitialLoad = true;
    this.currentMatchupData = null;
    this.currentSeason = null;
    this.currentWeek = null;

    this.initializePage();
    this.expandedSections = {}

    if (chrome && chrome.storage) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.selectedLeague) {
          const newLeague = changes.selectedLeague.newValue;

          // Optional: clear feed first
          if (this.scoringFeed) this.scoringFeed.clearFeed();

          // Refresh live page for new league
          location.reload();
        }
      });
    }

  }

  getStorageAPI() {
    if (typeof browser !== "undefined" && browser.storage) {
      return browser.storage.local;
    } else if (typeof chrome !== "undefined" && chrome.storage) {
      return chrome.storage.local;
    }
    return null;
  }


  async initializePage() {
    this.storage = this.getStorageAPI();

    if (!this.storage) {
      this.showError('No league or username found. Please set them in the popup.');
      return;
    }

    // Theme setup
    try {
      const savedTheme = await this.storage.get('theme');
      const theme = savedTheme?.theme || 'light';
      this.applyTheme(theme);

      const themeToggle = document.getElementById('themeToggle');
      if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
        themeToggle.addEventListener('click', async () => {
          const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
          this.applyTheme(newTheme);
          themeToggle.textContent = newTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
          if (this.storage) await this.storage.set({ theme: newTheme });
        });
      }
    } catch (err) {
      console.error('Error initializing theme:', err);
    }

    // Load league & user data
    try {
      const saved = await this.storage.get(['selectedLeague', 'username', 'leagueList']);
      const { selectedLeague: leagueId, username } = saved;

      this.currentUsername = username || null;

      // Populate league dropdown
      await this.populateLeagueDropdown();

      // Start live updates if both league and username exist
      if (username && leagueId) {
        this.currentLeague = leagueId;
        await this.startLiveUpdates(leagueId, username);
      }

    } catch (error) {
      console.error('Error initializing live page:', error);
      this.showError('Failed to initialize live scoring.');
    }
  }


  async startLiveUpdates(leagueId, username) {
    // Initial load
    await this.updateMatchupData(leagueId, username);

    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Set up recurring updates every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updateMatchupData(leagueId, username);
    }, 5000);
  }

  async updateMatchupData(leagueId, username) {
    try {
      if (this.isInitialLoad) {
        UIComponents.showLoadingState('matchups', 'Loading live matchup...');
      }

      const matchupData = await this.matchupService.getMatchupData(username, leagueId);
      await this.renderLiveMatchup(matchupData);

      this.currentMatchupData = matchupData;
      this.isInitialLoad = false;

    } catch (error) {
      console.error('Error updating matchup data:', error);
      UIComponents.showError('matchups', 'Failed to load matchup.');
    }
  }

  async renderLiveMatchup(data) {
    const { league, season, week, myRoster, opponentRoster, myMatchup, opponentMatchup, userMap, allPlayers } = data;

    const games = await this.api.getNFLGames(season);

    // Update page header
    this.updatePageHeader(league.name, week);

    // Store current season/week for player modal
    this.currentSeason = season;
    this.currentWeek = week;

    // Calculate projections
    const [myProjections, opponentProjections] = await Promise.all([
      this.matchupService.calculateProjectionsForRoster(myRoster, myMatchup, league, allPlayers, season, week, games),
      this.matchupService.calculateProjectionsForRoster(opponentRoster, opponentMatchup, league, allPlayers, season, week, games)
    ]);

    // Score totals
    const myTotal = myMatchup.points || 0;
    const opponentTotal = opponentMatchup.points || 0;

    const winProbability = await this.matchupService.calculateLiveWinProbabilityCached(
      myMatchup.matchup_id,
      myMatchup.points || 0,
      myProjections.totalProjected,
      myRoster.starters,
      opponentMatchup.points || 0,
      opponentProjections.totalProjected,
      opponentRoster.starters,
      allPlayers,
      games,
      100,
      2
    );

    const myIsWinning = myTotal > opponentTotal;
    const oppIsWinning = opponentTotal > myTotal;

    const html = `
  <div class="rosters-container">
    <div class="win-prob-bar">
      <div class="win-prob-fill" style="width: ${winProbability}%; background-color: ${winProbability >= 50 ? '#28a745' : '#dc3545'}"></div>
      <span class="win-prob-text">${winProbability.toFixed(1)}% Win Probability</span>
    </div>

    ${UIComponents.createLiveRosterHTML(myRoster, myMatchup, myProjections, userMap[myRoster.owner_id], opponentProjections.totalCombined, myIsWinning, games, true)}
    ${UIComponents.createLiveRosterHTML(opponentRoster, opponentMatchup, opponentProjections, userMap[opponentRoster.owner_id], myProjections.totalCombined, oppIsWinning, games, true)}
  </div>
`;

    UIComponents.updateElement('matchups', html);

    // Re-initialize scoring feed DOM elements
    //this.scoringFeed.clear();
    this.scoringFeed.updatePlayerScores(myProjections.playerData, userMap, myRoster.owner_id);
    this.scoringFeed.updatePlayerScores(opponentProjections.playerData, userMap, opponentRoster.owner_id);

    // Attach click listener for player modal
    this.attachPlayerClickListener();

    // Attach collapse listener
    document.querySelectorAll('.roster-section').forEach((section, index) => {
      const sectionId = section.dataset.sectionId || `section-${index}`;
      section.dataset.sectionId = sectionId; // ensure each section has a stable ID

      // Restore previous state if exists
      if (this.expandedSections[sectionId]) {
        section.classList.remove('collapsed');
      }

      // Attach toggle listener
      const header = section.querySelector('.roster-header');
      if (header) {
        header.addEventListener('click', () => {
          const isCollapsed = section.classList.toggle('collapsed');
          this.expandedSections[sectionId] = !isCollapsed; // true if expanded
        });
      }
    });

  }


attachPlayerClickListener() {
  document.getElementById('matchups').addEventListener('click', async (e) => {
    const link = e.target.closest('.player-link');
    if (!link) return;
    e.preventDefault();

    const playerId = link.closest('.player-item')?.id?.replace('player-', '');
    if (!playerId) return;

    const modal = document.getElementById('playerModal');
    const modalBody = document.getElementById('modalBody');

    // Prepare week dropdown options
    const weekOptions = `<option value="season">Season</option>` +
      Array.from({ length: this.currentWeek }, (_, i) => 
        `<option value="${i + 1}">Week ${i + 1}</option>`
      ).join('');

    // Initialize modal structure
    modalBody.innerHTML = `
      <div class="player-card-container">
        <div id="playerStatsList"></div>
      </div>
    `;
    modal.classList.remove('hidden');

    // Close modal handlers
    document.getElementById('modalClose').onclick = () => modal.classList.add('hidden');
    window.onclick = (event) => { if (event.target === modal) modal.classList.add('hidden'); };

    // Function to load player stats
    const loadPlayerStats = async (week) => {
      let playerData;

      if (week === 'season') {
        const seasonData = await this.api.getPlayerSeasonStats(playerId, this.currentSeason);
        const weekData = await this.api.getPlayerDetails(playerId, this.currentSeason, 1); // metadata
        playerData = {
          ...seasonData,
          full_name: weekData.full_name,
          position: weekData.position,
          team: weekData.team,
          season: weekData.season,
          injury_status: weekData.injury_status,
          week: 'season'
        };
      } else {
        playerData = await this.api.getPlayerDetails(playerId, this.currentSeason, week);
        if (playerData) playerData.week = week;
      }

      if (!playerData) {
        document.getElementById('playerStatsList').innerHTML = '<div class="error">No stats available.</div>';
        return;
      }

      // Header info
      const initials = playerData.full_name ? playerData.full_name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'PL';
      const getPositionColor = (pos) => {
        const p = pos?.toUpperCase();
        if (p === 'QB') return '#d32f2f';
        if (p === 'RB' || p === 'FB') return '#1976d2';
        if (p === 'WR' || p === 'TE') return '#388e3c';
        return '#d32f2f';
      };
      const positionColor = getPositionColor(playerData.position);
      const statusMap = {
        ACTIVE: { text: 'ACTIVE', color: '#28a745' },
        QUESTIONABLE: { text: 'QUESTIONABLE', color: '#ffc107' },
        DOUBTFUL: { text: 'DOUBTFUL', color: '#ff9800' },
        OUT: { text: 'OUT', color: '#dc3545' },
        INJURED_RESERVE: { text: 'IR', color: '#6c757d' },
      };
      const status = statusMap[playerData.injury_status?.toUpperCase()] || statusMap.ACTIVE;

      const playerCardHeader = `
        <div class="nfl-player-header" style="background: linear-gradient(135deg, ${positionColor} 0%, ${positionColor}dd 100%);">
          <div class="player-basic-info">
            <div class="player-avatar">${initials}</div>
            <div class="player-name-section">
              <h1 class="player-name">${playerData.full_name}</h1>
              <div class="player-meta">
                <span><strong>POS:</strong> ${playerData.position || 'N/A'}</span>
                <span><strong>TEAM:</strong> ${playerData.team || 'N/A'}</span>
                <span><strong>SEASON:</strong> ${playerData.season || 'N/A'}</span>
                <span><strong>WEEK:</strong> ${playerData.week === 'season' ? '' : playerData.week}</span>
              </div>
            </div>
            <div class="status-badge" style="background-color: ${status.color}">${status.text}</div>
          </div>
          <div class="player-rankings">
            <div class="ranking-item">
              <div class="ranking-value">${playerData.pos_rank_std || '--'}</div>
              <div class="ranking-label">STD Rank</div>
            </div>
            <div class="ranking-item">
              <div class="ranking-value">${playerData.pos_rank_ppr || '--'}</div>
              <div class="ranking-label">PPR Rank</div>
            </div>
            <div class="ranking-item">
              <div class="ranking-value">${playerData.pts_std || '--'}</div>
              <div class="ranking-label">STD Pts</div>
            </div>
            <div class="ranking-item">
              <div class="ranking-value">${playerData.pts_ppr || '--'}</div>
              <div class="ranking-label">PPR Pts</div>
            </div>
          </div>
        </div>
      `;

      const weekSelector = `
        <div class="nfl-stats-content">
          <div class="week-selector">
            <select id="weekSelect">${weekOptions}</select>
          </div>
          <div id="statsContainer"></div>
        </div>
      `;

      // Stats categories
      const statsCategories = {
        "Passing": [["pass_att","Attempts"],["pass_cmp","Completions"],["pass_yd","Yards"],["pass_td","Touchdowns"],["pass_int","Interceptions"],["pass_lng","Longest Pass"],["pass_rating","Rating"]],
        "Rushing": [["rush_att","Attempts"],["rush_yd","Yards"],["rush_lng","Longest Rush"],["rush_fd","First Downs"],["rush_rz_att","Redzone Attempts"],["rush_tkl_loss","Tackles for Loss"],["rush_tkl_loss_yd","Tackle Loss Yards"],["rush_ypa","Yards per Attempt"]],
        "Receiving": [["rec","Receptions"],["rec_tgt","Targets"],["rec_yd","Receiving Yards"],["rec_yar","Yards After Reception"],["rec_ypr","Yards per Reception"],["rec_ypt","Yards per Target"],["rec_lng","Longest Reception"],["rec_fd","First Downs"],["rec_20_29","20-29 Yard Receptions"],["rec_air_yd","Air Yards"]],
        "Fantasy & Scoring": [["pts_std","Fantasy Pts (STD)"],["pts_half_ppr","Fantasy Pts (0.5 PPR)"],["pts_ppr","Fantasy Pts (PPR)"],["pos_rank_std","Position Rank (STD)"],["pos_rank_half_ppr","Position Rank (0.5 PPR)"],["pos_rank_ppr","Position Rank (PPR)"]],
        "Game Info": [["gp","Games Played"],["gs","Games Started"],["gms_active","Active Games"],["off_snp","Offensive Snaps"],["tm_off_snp","Team Offensive Snaps"]],
        "Miscellaneous": [["tm_def_snp","Team Defensive Snaps"],["tm_st_snp","Team ST Snaps"],["pass_rush_yd","Pass Rush Yards"],["penalty","Penalties"],["penalty_yd","Penalty Yards"]]
      };

      // Generate stats HTML
      let statsHtml = "";
      for (const [category, stats] of Object.entries(statsCategories)) {
        const categoryStats = stats.filter(([key]) => playerData[key] !== undefined && playerData[key] !== null && playerData[key] !== 0);
        if (!categoryStats.length) continue;

        statsHtml += `<div class="nfl-stats-section"><h3 class="nfl-section-title">${category}</h3><div class="nfl-stats-grid">`;
        categoryStats.forEach(([key,label]) => {
          const raw = playerData[key];
          const value = typeof raw === "number" ? (raw % 1 === 0 ? raw : raw.toFixed(1)) : raw;
          statsHtml += `<div class="nfl-stat-item"><div class="nfl-stat-label">${label}</div><div class="nfl-stat-value">${value}</div></div>`;
        });
        statsHtml += `</div></div>`;
      }

      document.getElementById('playerStatsList').innerHTML = `${playerCardHeader}${weekSelector}`;
      document.getElementById('statsContainer').innerHTML = statsHtml;

      // Set dropdown value correctly
      const weekSelectEl = document.getElementById('weekSelect');
      weekSelectEl.value = week === 'season' ? 'season' : week;

      // On change handler
      weekSelectEl.onchange = (e) => {
        const selectedWeek = e.target.value === 'season' ? 'season' : parseInt(e.target.value, 10);
        loadPlayerStats(selectedWeek);
      };
    };

    // Initial load defaults to season
    loadPlayerStats('season');
  });
}

  async populateLeagueDropdown() {
    if (!this.storage) return;

    try {
      const saved = await this.storage.get(['leagueList', 'selectedLeague']);
      const leagues = saved.leagueList || [];
      if (!leagues.length) return;

      const select = document.getElementById('leagueSelectLive');

      // Clear and populate options
      select.innerHTML = UIComponents.createLeagueOptions(leagues);

      // Remove old listeners by cloning
      const newSelect = select.cloneNode(true);
      select.parentNode.replaceChild(newSelect, select);

      // Attach change listener
      newSelect.addEventListener('change', async (e) => {
        const leagueId = e.target.value;
        if (!leagueId) return;

        if (this.scoringFeed) {
          this.scoringFeed.clearFeed();
        }

        this.currentLeague = leagueId;

        if (this.storage) await this.storage.set({ selectedLeague: leagueId });

        if (this.currentUsername && this.currentLeague) {
          await this.updateMatchupData(this.currentLeague, this.currentUsername);
        }
      });

      // Now set the selected value **after replacing and attaching listener**
      if (saved.selectedLeague) {
        this.currentLeague = saved.selectedLeague;
        newSelect.value = this.currentLeague;
      }

    } catch (err) {
      console.error('Error populating league dropdown:', err);
    }
  }

  updatePageHeader(leagueName, week) {
    // Instead of touching <h1>, update the <select> label if needed
    const select = document.getElementById('leagueSelectLive');
    if (select && select.value) {
      const option = [...select.options].find(opt => opt.value === select.value);
      if (option) option.textContent = leagueName;
    }

    const matchupPanel = document.getElementById('matchupPanel');
    if (matchupPanel) {
      const h3 = matchupPanel.querySelector('h3');
      if (h3) h3.innerHTML = `Week ${week} Matchup`;
    }
  }


  applyTheme(theme) {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }


  updateScoringFeed(myProjections, opponentProjections, userMap, myOwnerId, opponentOwnerId) {
    // Clear previous score deltas so we only notify once per change
    this.scoringFeed.clear();

    this.scoringFeed.updatePlayerScores(myProjections.playerData, userMap, myOwnerId);
    this.scoringFeed.updatePlayerScores(opponentProjections.playerData, userMap, opponentOwnerId);
  }

  showError(message) {
    UIComponents.showError('matchups', message);
  }

  destroy() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.scoringFeed.clear();
    this.api.clearCache();
  }
}
// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const liveController = new LiveController();

  window.addEventListener('beforeunload', () => {
    liveController.destroy();
  });
});
