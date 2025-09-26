// ui/components.js - Reusable UI components
class UIComponents {
  static createLiveRosterHTML(roster, matchup, projectionData, teamName, opponentTotal, isWinning, games, linksActive) {
    const total = matchup.points || 0;
    const projectedTotal = projectionData.totalCombined;
    const colorClass = this.getScoreColorClass(total, opponentTotal);
    const winningClass = opponentTotal !== null && total > opponentTotal ? "winning" : "";

    return `
    <div class="roster-section collapsed ${winningClass}">
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
          ${this.createPlayerListHTML(projectionData.playerData, games, linksActive)}
        </ul>
      </div>
    </div>
  `;
  }

  static createPlayerListHTML(playerData, espnGames, linksActive) {
    const playersWithLive = this.mapPlayersToLiveGames(playerData, espnGames);

    return playersWithLive.map(data => {
      const { id, player, actualPoints, projectedPoints, position, gameState } = data;

      // Use checkmark if game finished
      const displayPosition = gameState === 'post' ? '✔️' : (position === 'SUPER_FLEX' ? 'SF' : position);
      const playerPosition = player.position;

      // Base injury/status
      const injuryStatus = (player?.injury_status || 'ACTIVE').toUpperCase();
      let injurySymbol = '';
      let statusClass = ScoringCalculator.prototype.getPlayerStatusClass(player);

      switch (injuryStatus) {
        case 'OUT':
        case 'IR':
          injurySymbol = '🤕';
          statusClass = 'out';
          break;
        case 'QUESTIONABLE':
          injurySymbol = '❓';
          statusClass = 'questionable';
          break;
        default:
          statusClass = 'active';
          injurySymbol = '';
      }

      // Append game state classes
      if (gameState === 'in') statusClass += ' live';
      if (gameState === 'post') statusClass += ' finished';

      const playerName = player?.full_name || 'Unknown Player';
      const nameHTML = linksActive
        ? `<a href="#" class="player-link ${statusClass}" data-player-id="${id}">
       ${playerName} <span class="player-position">(${playerPosition})</span> ${injurySymbol}
     </a>`
        : `<span class="${statusClass}">
       ${playerName} <span class="player-position">(${playerPosition})</span> ${injurySymbol}
     </span>`;
     
      return `
<li id="player-${id}" class="player-item ${statusClass}">
  <span class="player-top">
    <span class="position">${displayPosition}</span> - 
    ${nameHTML} 
    <span class="points">${actualPoints.toFixed(1)} pts</span>
  </span>
  <span class="projection">Projected: ${projectedPoints.toFixed(1)}</span>
</li>
    `;
    }).join('');
  }
  // add this static helper to UIComponents
  static mapPlayersToLiveGames(playerData, espnGames) {
    return playerData.map(player => {
      if (!player || !espnGames?.length) return { ...player, gameState: 'pre' };


      let team = player.player.team.toUpperCase();
      // Hardcode the Washington mismatch
      if (team === 'WAS') team = 'WSH';
      const game = espnGames.find(g => {
        return g.shortName?.toUpperCase().includes(team);
      });


      const state = game?.status?.toLowerCase() || 'pre';

      return { ...player, gameState: state }; // 'pre', 'in', 'post'
    });
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
    this.previousPlayerStats = {};
    this.feedElement = document.getElementById('feed');
  }





  updatePlayerScores(playerData, userMap, rosterId) {
    if (!this.feedElement) return;

    const fragment = document.createDocumentFragment();

    playerData.forEach(data => {
      const { id, player, actualPoints, detailedStats } = data;

      // Initialize previous state if missing (first run)
      if (!this.previousPlayerStats) this.previousPlayerStats = {};
      if (!this.lastScores) this.lastScores = new Map();
      if (!(id in this.previousPlayerStats)) {
        this.previousPlayerStats[id] = { ...detailedStats };
        this.lastScores.set(id, actualPoints);
        return; // skip feed on first run
      }

      const prevPoints = this.lastScores.get(id) || 0;
      const prevStats = this.previousPlayerStats[id] || {};

      const scoreDiff = actualPoints - prevPoints;

      // Only consider stats in statNameMap
      const statNameMap = {
        pass_cmp: "Completion",
        pass_yd: "Yards",
        pass_td: "Touchdown",
        pass_int: "Interception",
        rush_att: "Rush",
        rush_yd: "Yards",
        rush_td: "Touchdown",
        rec: "Reception",
        rec_yd: "Yards",
        rec_td: "Touchdown",
        fum: "Fumble",
      };

      const statDeltas = {};
      for (const key of Object.keys(statNameMap)) {
        const delta = (detailedStats[key] || 0) - (prevStats[key] || 0);
        if (delta !== 0) statDeltas[key] = delta;
      }
      const hasStatsDelta = Object.keys(statDeltas).length > 0;

      if (scoreDiff !== 0 && hasStatsDelta) {
        const feedItem = this.createFeedItem(player, scoreDiff, statDeltas, userMap, rosterId, true);
        if (feedItem) fragment.appendChild(feedItem);

        // Update memory only when feed actually fires
        this.lastScores.set(id, actualPoints);
        this.previousPlayerStats[id] = { ...detailedStats };
      }
    });

    if (fragment.childNodes.length > 0) {
      this.feedElement.prepend(fragment);
    }
  }

  // Modified version of addFeedItem to return element instead of directly prepending
  createFeedItem(player, scoreDiff, detailedStats, userMap, rosterId, hasStatsDelta) {
    if (scoreDiff === 0) return null; // don’t build anything

    const ownerName = userMap[rosterId] || 'Unknown Team';
    const timestamp = UIComponents.formatTime();

    const colorClass = scoreDiff > 0 ? 'positive' : (scoreDiff < 0 ? 'negative' : 'neutral');
    const borderColor = scoreDiff > 0 ? 'green' : (scoreDiff < 0 ? 'red' : 'gray');

    const playerName = player?.full_name || 'Unknown Player';

    const statNameMap = {
      pass_cmp: "Completion",
      pass_yd: "Yards",
      pass_td: "Touchdown",
      pass_int: "Interception",
      rush_att: "Rush",
      rush_yd: "Yards",
      rush_td: "Touchdown",
      rec: "Reception",
      rec_yd: "Yards",
      rec_td: "Touchdown",
      fum: "Fumble",
    };

    let statsHTML = '';
    if (hasStatsDelta && detailedStats) {
      statsHTML = Object.entries(detailedStats)
        .filter(([statKey, delta]) => statNameMap[statKey] && delta !== 0)
        .map(([statKey, delta]) => {
          const deltaClass = delta > 0 ? 'positive' : 'negative';
          const deltaSign = delta > 0 ? '+' : '';
          const statName = statNameMap[statKey];
          return `<span class="${deltaClass}">${statName}: ${deltaSign}${delta}</span>`;
        })
        .join(' • ');
    }

    const feedItem = document.createElement('div');
    feedItem.className = 'feed-item';
    feedItem.style.borderLeftColor = borderColor;
    feedItem.innerHTML = `
    <div class="feed-item-main">
      <span class="${colorClass}">${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(1)} pts</span>
      <strong>${playerName}</strong>
      <span class="team-name">${ownerName}</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    ${statsHTML ? `<div class="feed-item-stats">${statsHTML}</div>` : ''}
  `;

    return feedItem; // ✅ just return the node
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

  clearFeed() {
    this.lastScores.clear();
    if (this.feedElement) {
      this.feedElement.innerHTML = '';
    }
  }
}
