// ui/components.js - Reusable UI components
class UIComponents {
  static createLiveRosterHTML(roster, matchup, projectionData, teamName, opponentTotal, isWinning, games) {
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
          ${this.createPlayerListHTML(projectionData.playerData, games)}
        </ul>
      </div>
    </div>
  `;
  }

static createPlayerListHTML(playerData, espnGames) {
  const playersWithLive = this.mapPlayersToLiveGames(playerData, espnGames);

  return playersWithLive.map(data => {
    const { id, player, actualPoints, projectedPoints, position, isLive } = data;
    const displayPosition = position === 'SUPER_FLEX' ? 'SF' : position;
    const statusClass = ScoringCalculator.prototype.getPlayerStatusClass(player);
    const playerName = player?.full_name || 'Unknown Player';

    // Normalize injury status
    const injuryStatus = (player?.injury_status || 'ACTIVE').toUpperCase();

    let injurySymbol = '';
    let injuryClass = '';

    switch (injuryStatus) {
      case 'OUT':
      case 'IR':
        injurySymbol = '🤕';
        injuryClass = 'out';
        break;
      case 'QUESTIONABLE':
        injurySymbol = '❓';
        injuryClass = 'questionable';
        break;
      default:
        injurySymbol = '';
        injuryClass = '';
    }

    return `
<li id="player-${id}" class="player-item ${statusClass} ${injuryClass} ${isLive ? 'live' : ''}">
  <span class="player-top">
    <span class="position">${displayPosition}</span> - 
    <span class="player">${playerName} ${injurySymbol}</span> 
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
      const liveGame = espnGames.find(game =>
        Array.isArray(game.competitions) &&
        game.competitions[0]?.competitors?.some(c => c.team.abbreviation === player.player.team)
      );
      return {
        ...player,
        isLive: liveGame ? liveGame.status.type.state === 'in' : false,
      };
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
    this.feedElement = document.getElementById('feed');
  }





  updatePlayerScores(playerData, userMap, rosterId) {
    if (!this.feedElement) return;

    const fragment = document.createDocumentFragment(); // <-- batch updates

    playerData.forEach(data => {
      const { id, player, actualPoints, detailedStats } = data;
      const previousScore = this.lastScores.get(id) || 0;
      let scoreDiff = actualPoints - previousScore;
      const hasStatsDelta = detailedStats && Object.keys(detailedStats).length > 0;

      if (scoreDiff !== 0 || hasStatsDelta) {
        const feedItem = this.createFeedItem(player, scoreDiff, detailedStats, userMap, rosterId, hasStatsDelta);
        fragment.appendChild(feedItem); // <-- add to fragment
      }

      this.lastScores.set(id, actualPoints);
    });

    // Prepend all new items in one DOM operation
    this.feedElement.prepend(fragment);
  }

  // Modified version of addFeedItem to return element instead of directly prepending
  createFeedItem(player, scoreDiff, detailedStats, userMap, rosterId, hasStatsDelta) {
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
        .filter(([_, delta]) => delta !== 0)
        .map(([statKey, delta]) => {
          const deltaClass = delta > 0 ? 'positive' : 'negative';
          const deltaSign = delta > 0 ? '+' : '';
          const statName = statNameMap[statKey] || statKey;
          return `<span class="${deltaClass}">${statName}: ${deltaSign}${delta}</span>`;
        })
        .join(' • ');
    }

    const feedItem = document.createElement('div');
    feedItem.className = 'feed-item';
    feedItem.style.borderLeftColor = borderColor;
    feedItem.innerHTML = `
    <div class="feed-item-main">
      <span class="${colorClass}">
        ${scoreDiff !== 0 ? (scoreDiff > 0 ? '+' : '') + scoreDiff.toFixed(1) + ' pts' : ''}
      </span>
      <strong>${playerName}</strong>
      <span class="team-name">${ownerName}</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    ${statsHTML ? `<div class="feed-item-stats">${statsHTML}</div>` : ''}
  `;

    return feedItem; // <-- return instead of prepending
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
