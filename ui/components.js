// ui/components.js - Reusable UI components
class UIComponents {
  static createRosterHTML(roster, matchup, projectionData, teamName, opponentTotal = null) {
    const total = matchup.points || 0;
    const projectedTotal = projectionData.totalCombined;

    const colorClass = this.getScoreColorClass(total, opponentTotal);

    return `
  <div class="roster-section collapsed"> 
    <div class="roster-header">
      <h3 class="matchup-header">
        ${teamName} <span class="points ${colorClass}">${total.toFixed(1)}</span>
      </h3>
      <span class="toggle-btn">▾</span>
    </div>
    <h4 class="matchup-subheader">
	  <span class="projection-inline">Projected: ${projectedTotal.toFixed(1)}</span>
    </h4>
    <div class="player-list-container">
      <ul class="player-list">
        ${this.createPlayerListHTML(projectionData.playerData)}
      </ul>
    </div>
  </div>
`;
  }

  static createPlayerListHTML(playerData) {
    return playerData.map(data => {
      const { id, player, actualPoints, projectedPoints, position } = data;
      const displayPosition = position === 'SUPER_FLEX' ? 'SF' : position;
      const statusClass = ScoringCalculator.prototype.getPlayerStatusClass(player);
      const playerName = player?.full_name || 'Unknown Player';

      return `
<li id="player-${id}" class="player-item ${statusClass}">
  <span class="player-top">
    <span class="position">${displayPosition}</span> - 
    <span class="player">${playerName}</span> 
    <span class="points">${actualPoints.toFixed(1)} pts</span>
  </span>
  <span class="projection">Projected: ${projectedPoints.toFixed(1)}</span>
</li>
    `;
    }).join('');
  }

  static getScoreColorClass(myScore, opponentScore) {
    if (!opponentScore) return '';
    if (myScore > opponentScore) return 'winning';
    if (myScore < opponentScore) return 'losing';
    return 'tied';
  }

  static showLoadingState(elementId, message = 'Loading...') {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<div class="loading">${message}</div>`;
    }
  }

  static showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<div class="error">${message}</div>`;
    }
  }

  static updateElement(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = content;
    }
  }



  static createToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  static createLeagueOptions(leagues) {
    const defaultOption = '<option value="" selected disabled>Select a league...</option>';
    const leagueOptions = leagues.map(league =>
      `<option value="${league.league_id}">${league.name}</option>`
    ).join('');

    return defaultOption + leagueOptions;
  }

  static formatPosition(position) {
    return position === 'SUPER_FLEX' ? 'SF' : position;
  }

  static formatTime() {
    return new Date().toLocaleTimeString();
  }
}

// Separate class for managing the scoring feed
class ScoringFeed {
  constructor() {
    this.lastScores = new Map();
    this.feedElement = document.getElementById('feed');
  }

  updatePlayerScores(playerData, userMap, rosterId) {
    if (!this.feedElement) return;

    playerData.forEach(data => {
      const { id, player, actualPoints } = data;
      const previousScore = this.lastScores.get(id) || 0;

      if (actualPoints !== previousScore && previousScore > 0) {
        this.addFeedItem(player, actualPoints - previousScore, userMap, rosterId);
      }

      this.lastScores.set(id, actualPoints);
    });
  }

  addFeedItem(player, scoreDiff, userMap, rosterId) {
    const ownerName = userMap[rosterId] || 'Unknown Team';
    const timestamp = UIComponents.formatTime();
    const colorClass = scoreDiff > 0 ? 'positive' : 'negative';
    const playerName = player?.full_name || 'Unknown Player';

    const feedItem = document.createElement('div');
    feedItem.className = 'feed-item';
    feedItem.innerHTML = `
      <strong class="${colorClass}">${playerName}</strong>
      <span class="${colorClass}">${scoreDiff.toFixed(1)} pts</span>
      <span class="team-name">${ownerName}</span>
      <span class="timestamp">${timestamp}</span>
    `;

    this.feedElement.prepend(feedItem);

    // Show toast notification
    UIComponents.createToast(`${playerName} ${scoreDiff.toFixed(1)} pts`);

    // Limit feed items to prevent memory issues
    this.trimFeedItems();
  }

  trimFeedItems(maxItems = 50) {
    if (!this.feedElement) return;

    const items = this.feedElement.querySelectorAll('.feed-item');
    if (items.length > maxItems) {
      for (let i = maxItems; i < items.length; i++) {
        items[i].remove();
      }
    }
  }

  clear() {
    this.lastScores.clear();
    if (this.feedElement) {
      this.feedElement.innerHTML = '';
    }
  }
}
