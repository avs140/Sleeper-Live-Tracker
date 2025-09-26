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
    const statNameMap = {
      pass_cmp: "Completions",
      pass_att: "Pass Attempts",
      pass_yd: "Passing Yards",
      pass_td: "Passing TDs",
      pass_int: "Interceptions",
      pass_rtg: "Pass Rating",
      pass_lng: "Longest Pass",
      pass_ypa: "Yards/Attempt",
      pass_ypc: "Yards/Completion",
      rush_att: "Rush Attempts",
      rush_yd: "Rushing Yards",
      rush_td: "Rushing TDs",
      rush_lng: "Longest Rush",
      rush_fd: "Rushing First Downs",
      rec: "Receptions",
      rec_yd: "Receiving Yards",
      rec_td: "Receiving TDs",
      rec_lng: "Longest Reception",
      rec_fd: "Receiving First Downs",
      fum: "Fumbles",
    };

    document.getElementById('matchups').addEventListener('click', async (e) => {
      const link = e.target.closest('.player-link');
      if (!link) return;
      e.preventDefault();

      const playerId = link.closest('.player-item')?.id?.replace('player-', '');
      if (!playerId) return;

      const modal = document.getElementById('playerModal');
      const modalBody = document.getElementById('modalBody');

      // Create week selector
      // Create week selector (only up to currentWeek)
      const weekOptions = Array.from({ length: this.currentWeek }, (_, i) =>
        `<option value="${i + 1}">Week ${i + 1}</option>`
      ).join('');
      modalBody.innerHTML = `
  <div id="playerWeekSelector">
    <select id="weekSelect">${weekOptions}</select>
  </div>
  <ul id="playerStatsList"></ul>
`;

      modal.classList.remove('hidden');

      // Close modal
      document.getElementById('modalClose').onclick = () => modal.classList.add('hidden');
      window.onclick = (event) => { if (event.target === modal) modal.classList.add('hidden'); };

      const weekSelect = document.getElementById('weekSelect');

      const loadPlayerStats = async (week) => {
        const playerData = await this.api.getPlayerDetails(playerId, this.currentSeason, week);

        if (!playerData) {
          document.getElementById('playerStatsList').innerHTML = '<li>No stats available for this week.</li>';
          return;
        }

        // Set week selector to current week
        weekSelect.value = playerData.week;

        const statsHtml = Object.entries(statNameMap)
          .filter(([key]) => playerData[key] !== undefined && playerData[key] !== null)
          .map(([key, displayName]) => {
            const value = playerData[key];
            const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
            const className = typeof value === 'number' && value > 0 ? 'positive' : value < 0 ? 'negative' : '';
            return `<li class="${className}"><strong>${displayName}:</strong> ${displayValue}</li>`;
          })
          .join('');

        document.getElementById('playerStatsList').innerHTML = `
        <h2>${playerData.full_name}</h2>
        <p><strong>Position:</strong> ${playerData.position}</p>
        <p><strong>Team:</strong> ${playerData.team}</p>
        <p><strong>Season:</strong> ${playerData.season}, <strong>Week:</strong> ${playerData.week}</p>
        ${statsHtml || '<li>No stats available for this week.</li>'}
      `;
      };

      // Initial load
      await loadPlayerStats(this.currentWeek);

      // Reload stats when week changes
      weekSelect.addEventListener('change', async (e) => {
        await loadPlayerStats(e.target.value);
      });
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
