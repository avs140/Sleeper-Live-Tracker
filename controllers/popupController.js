// controllers/popupController.js - Main popup logic
class PopupController {
  constructor() {
    this.api = new SleeperAPI();
    this.matchupService = new MatchupService(this.api);
    this.storage = this.getStorageAPI();
    this.currentLeague = null;
    this.currentUsername = null;
    
    this.initializeElements();
    this.attachEventListeners();
    this.loadSavedData();
  }

  getStorageAPI() {
    if (typeof browser !== "undefined" && browser.storage) {
      return browser.storage.local;
    } else if (typeof chrome !== "undefined" && chrome.storage) {
      return chrome.storage.local;
    }
    console.warn("Storage API not available");
    return null;
  }

  initializeElements() {
    this.elements = {
      username: document.getElementById('username'),
      loadBtn: document.getElementById('loadBtn'),
      leagueSelect: document.getElementById('leagueSelect'),
      liveBtn: document.getElementById('liveBtn'),
      matchups: document.getElementById('matchups'),
      weekTitle: document.getElementById('weektitle')
    };
  }

  attachEventListeners() {
    this.elements.loadBtn?.addEventListener('click', () => this.handleLoadClick());
    this.elements.leagueSelect?.addEventListener('change', (e) => this.handleLeagueChange(e));
    this.elements.liveBtn?.addEventListener('click', () => this.openLivePage());
	  
	  
	document.getElementById('themeToggle')?.addEventListener('click', async () => {
    const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
    if (this.storage) await this.storage.set({ theme: newTheme });
    this.applyTheme(newTheme);
    this.updateThemeButton(newTheme);
  });
	
  }

 async loadSavedData() {
  if (!this.storage) return;

  try {
    const saved = await this.storage.get(['username', 'selectedLeague', 'theme']);
    
    if (saved.username) {
      this.elements.username.value = saved.username;
      this.currentUsername = saved.username;
      await this.loadLeagues();

      if (saved.selectedLeague) {
        this.elements.leagueSelect.value = saved.selectedLeague;
        this.currentLeague = saved.selectedLeague;
        await this.loadMatchupData();
        this.showLiveButton();
      }
    }

    // Theme
    const theme = saved.theme || 'light';
    this.applyTheme(theme);
    this.updateThemeButton(theme);

  } catch (error) {
    console.error('Error loading saved data:', error);
  }
}

  async handleLoadClick() {
    const username = this.elements.username?.value.trim();
    if (!username) return;

    this.currentUsername = username;
    
    // Save username and request notification permission
    if (this.storage) {
      await this.storage.set({ username });
    }
    
    this.requestNotificationPermission();
    await this.loadLeagues();
  }

  requestNotificationPermission() {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }

  async loadLeagues() {
    if (!this.currentUsername) return;

    UIComponents.showLoadingState('matchups', 'Loading your leagues...');

    try {
      const user = await this.api.getUser(this.currentUsername);
      const nflState = await this.api.getNFLState();
      const leagues = await this.api.getUserLeagues(user.user_id, nflState.season);

      if (!leagues.length) {
        UIComponents.showError('matchups', 'No leagues found for this user.');
        return;
      }


	if (this.storage) {
      await this.storage.set({ leagueList: leagues });
    }
      // Populate league dropdown
      this.elements.leagueSelect.innerHTML = UIComponents.createLeagueOptions(leagues);
      UIComponents.updateElement('matchups', 'Select a league to view your matchup.');

    } catch (error) {
      console.error('Error loading leagues:', error);
      UIComponents.showError('matchups', 'Error loading leagues. Please check the username.');
    }
  }

  async handleLeagueChange(event) {
    const leagueId = event.target.value;
    if (!leagueId) return;

    this.currentLeague = leagueId;

    // Save selected league
    if (this.storage) {
      await this.storage.set({ selectedLeague: leagueId });
    }

    await this.loadMatchupData();
    this.showLiveButton();
  }

  async loadMatchupData() {
    if (!this.currentUsername || !this.currentLeague) return;

    UIComponents.showLoadingState('matchups', 'Loading your matchup...');

    try {
      const matchupData = await this.matchupService.getMatchupData(
        this.currentUsername, 
        this.currentLeague
      );

      await this.renderMatchupData(matchupData);

    } catch (error) {
      console.error('Error loading matchup data:', error);
      UIComponents.showError('matchups', error.message || 'Error loading matchup data.');
    }
  }

  async renderMatchupData(data) {
    const { league, week, myRoster, opponentRoster, myMatchup, opponentMatchup, userMap, allPlayers } = data;

    // Update week title
    UIComponents.updateElement('weektitle', `<h2>Week ${week} Matchup</h2>`);

    // Calculate projections for both teams
    const [myProjections, opponentProjections] = await Promise.all([
      this.matchupService.calculateProjectionsForRoster(
        myRoster, myMatchup, league, allPlayers, data.season, week
      ),
      this.matchupService.calculateProjectionsForRoster(
        opponentRoster, opponentMatchup, league, allPlayers, data.season, week
      )
    ]);
	
    // Render both rosters
    const myTeamName = userMap[myRoster.owner_id];
    const opponentTeamName = userMap[opponentRoster.owner_id];
	const winProbability = this.matchupService.calculateWinProbability(
	myProjections.totalCombined,
	opponentProjections.totalCombined
	);

const html = `
  <div class="rosters-container">
    ${UIComponents.createRosterHTML(
      myRoster, 
      myMatchup, 
      myProjections, 
      myTeamName, 
      opponentProjections.totalCombined
    )}

    <!-- Win probability bar between rosters -->
    <div class="win-prob-bar">
      <div class="win-prob-fill" style="width: ${winProbability}%; background-color: ${
        winProbability >= 50 ? '#28a745' : '#dc3545'
      }"></div>
      <span class="win-prob-text">${winProbability.toFixed(1)}% Win Probability</span>
    </div>

    ${UIComponents.createRosterHTML(
      opponentRoster, 
      opponentMatchup, 
      opponentProjections, 
      opponentTeamName, 
      myProjections.totalCombined
    )}
  </div>
`;

	const probFill = document.querySelector('.win-prob-fill');
	const probText = document.querySelector('.win-prob-text');

if (probFill && probText) {
  probFill.style.width = `${winProbability}%`;
  probFill.style.background = winProbability >= 50 ? '#28a745' : '#dc3545';
  probText.textContent = `${winProbability.toFixed(1)}%`;
}

    UIComponents.updateElement('matchups', html);
	
	document.querySelectorAll('.roster-header').forEach(header => {
  header.addEventListener('click', () => {
    const rosterSection = header.parentElement;
    rosterSection.classList.toggle('collapsed');
  });
});
	
  }

  showLiveButton() {
    if (this.elements.liveBtn) {
      this.elements.liveBtn.style.display = 'block';
    }
  }

  openLivePage() {
    const url = typeof chrome !== 'undefined' 
      ? chrome.runtime.getURL('live.html')
      : browser.runtime.getURL('live.html');

    if (typeof chrome !== 'undefined') {
      chrome.tabs.create({ url });
    } else if (typeof browser !== 'undefined') {
      browser.tabs.create({ url });
    }
  }
  applyTheme(theme) {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }

  updateThemeButton(theme) {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});