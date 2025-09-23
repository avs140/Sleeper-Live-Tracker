// controllers/liveController.js - Live scoring page logic
class LiveController {
  constructor() {
    this.api = new SleeperAPI();
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
    }, 30000);
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

    // Update page header
    this.updatePageHeader(league.name, week);

    // Store current season/week for player modal
    this.currentSeason = season;
    this.currentWeek = week;

    // Calculate projections
    const [myProjections, opponentProjections] = await Promise.all([
      this.matchupService.calculateProjectionsForRoster(myRoster, myMatchup, league, allPlayers, season, week),
      this.matchupService.calculateProjectionsForRoster(opponentRoster, opponentMatchup, league, allPlayers, season, week)
    ]);

    // Score totals
    const myTotal = myMatchup.points || 0;
    const opponentTotal = opponentMatchup.points || 0;
    const winProbability = this.matchupService.calculateWinProbability(myProjections.totalCombined, opponentProjections.totalCombined);


const myIsWinning = myTotal > opponentTotal;
const oppIsWinning = opponentTotal > myTotal;

const html = `
  <div class="rosters-container">
    <div class="win-prob-bar">
      <div class="win-prob-fill" style="width: ${winProbability}%; background-color: ${winProbability >= 50 ? '#28a745' : '#dc3545'}"></div>
      <span class="win-prob-text">${winProbability.toFixed(1)}% Win Probability</span>
    </div>

    ${this.createLiveRosterHTML(myRoster, myMatchup, myProjections, userMap[myRoster.owner_id], opponentProjections.totalCombined, myIsWinning)}
    ${this.createLiveRosterHTML(opponentRoster, opponentMatchup, opponentProjections, userMap[opponentRoster.owner_id], myProjections.totalCombined, oppIsWinning)}
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

  createLiveRosterHTML(roster, matchup, projectionData, teamName, opponentTotal, isWinning) {
  const total = matchup.points || 0;
  const projectedTotal = projectionData.totalCombined;
  const colorClass = UIComponents.getScoreColorClass(total, opponentTotal);
  const sectionId = `roster-${roster.owner_id}`; // stable ID

  const winningClass = isWinning ? 'winning' : ''; // <-- dynamically add winning

  return `
<div class="roster-section collapsed ${winningClass}" data-section-id="${sectionId}">
  <h3 class="matchup-header roster-header">
    <span class="team-name">${teamName}</span>
    <div class="header-right">
      <span class="points ${colorClass}">${total.toFixed(1)}</span>
      <span class="toggle-btn">▾</span>
    </div>
  </h3>
  <h4 class="matchup-subheader">
    Projected Total: <span>${projectedTotal.toFixed(1)}</span>
  </h4>
  <div class="player-list-container">
    <ul class="player-list">
      ${this.createLivePlayerListHTML(projectionData.playerData)}
    </ul>
  </div>
</div>
`;
}

  createLivePlayerListHTML(playerData) {
    return playerData.map(data => {
      const { id, player, actualPoints, projectedPoints, position } = data;
      const displayPosition = UIComponents.formatPosition(position);
      const statusClass = ScoringCalculator.prototype.getPlayerStatusClass(player);
      const playerName = player?.full_name || 'Unknown Player';
      const playerNameSafe = playerName.replace(/"/g, '&quot;');

      return `
<li id="player-${id}" class="player-item ${statusClass}">
  <div class="player-top">
    <span class="position">${displayPosition}</span>
    <a href="#" class="player-link" data-player-id="${id}" data-player-name="${playerNameSafe}" data-player-position="${displayPosition}" style="text-decoration: underline;">
      ${playerName}
    </a>
    <span class="points">${actualPoints.toFixed(1)} pts</span>
  </div>
  <div class="projection">Projected: ${projectedPoints.toFixed(1)}</div>
</li>
`;
    }).join('');
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

      const playerData = await this.api.getPlayerDetails(playerId, this.currentSeason, this.currentWeek);

      if (!playerData) {
        modalBody.innerHTML = '<p>No stats available for this week.</p>';
        modal.classList.remove('hidden');
        return;
      }

      const statsHtml = Object.entries(statNameMap)
        .filter(([key]) => playerData[key] !== undefined && playerData[key] !== null)
        .map(([key, displayName]) => {
          const value = playerData[key];
          const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
          return `<li><strong>${displayName}:</strong> ${displayValue}</li>`;
        })
        .join('');

      modalBody.innerHTML = `
      <h2>${playerData.full_name}</h2>
      <p><strong>Position:</strong> ${playerData.position}</p>
      <p><strong>Team:</strong> ${playerData.team}</p>
      <p><strong>Season:</strong> ${playerData.season}, <strong>Week:</strong> ${playerData.week}</p>
      <p><strong>Stats:</strong></p>
      <ul>
        ${statsHtml || '<li>No stats available for this week.</li>'}
      </ul>
    `;

      modal.classList.remove('hidden');

      document.getElementById('modalClose').onclick = () => modal.classList.add('hidden');
      window.onclick = (event) => { if (event.target === modal) modal.classList.add('hidden'); };
    });
  }

  async populateLeagueDropdown() {
    if (!this.storage) return;

    try {
      const saved = await this.storage.get(['leagueList', 'selectedLeague']);
      const leagues = saved.leagueList || [];
      if (!leagues.length) return;

      const select = document.getElementById('leagueSelectLive');
      select.innerHTML = UIComponents.createLeagueOptions(leagues);

      // Set current league if exists
      if (saved.selectedLeague) {
        this.currentLeague = saved.selectedLeague;
        select.value = this.currentLeague;
      }

      // Attach change listener
      select.addEventListener('change', async (e) => {
        const leagueId = e.target.value;
        if (!leagueId) return;
		
		if (this.scoringFeed) {
			this.scoringFeed.clearFeed();
		}

        this.currentLeague = leagueId;

        // Save the selection
        if (this.storage) await this.storage.set({ selectedLeague: leagueId });

        // Reload matchup data
        if (this.currentUsername && this.currentLeague) {
          await this.updateMatchupData(this.currentLeague, this.currentUsername);
        }
      });

		
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
