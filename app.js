"use strict";

/*
  ICECORE
  NHL Live Data Application

  Data source:
  NHL public web endpoints.

  The application is designed so that an unavailable
  network source never blocks the interface.
*/

const NHL_API = "https://api-web.nhle.com/v1";

const state = {
  selectedDate: getLocalDateString(),
  schedule: [],
  liveGames: [],
  refreshTimer: null
};

const elements = {
  featuredGames: document.getElementById("featuredGames"),
  gamesList: document.getElementById("gamesList"),
  liveGames: document.getElementById("liveGames"),
  dateInput: document.getElementById("dateInput"),
  selectedDateText: document.getElementById("selectedDateText"),
  selectedDateValue: document.getElementById("selectedDateValue"),
  refreshButton: document.getElementById("refreshButton"),
  connectionText: document.getElementById("connectionText"),
  gameModal: document.getElementById("gameModal"),
  gameDetailContent: document.getElementById("gameDetailContent"),
  toast: document.getElementById("toast")
};

/* -------------------- INITIALIZATION -------------------- */

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  updateDateDisplay();
  loadAllData();

  // Live data is refreshed automatically.
  state.refreshTimer = window.setInterval(loadLiveData, 30000);
});

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-action='games']").forEach(button => {
    button.addEventListener("click", () => showView("gamesView"));
  });

  document.getElementById("homeButton").addEventListener("click", () => {
    showView("coreView");
  });

  elements.refreshButton.addEventListener("click", () => {
    loadAllData(true);
  });

  document.getElementById("previousDay").addEventListener("click", () => {
    changeDate(-1);
  });

  document.getElementById("nextDay").addEventListener("click", () => {
    changeDate(1);
  });

  document.getElementById("datePickerButton").addEventListener("click", () => {
    elements.dateInput.showPicker?.() || elements.dateInput.click();
  });

  elements.dateInput.addEventListener("change", event => {
    if (!event.target.value) return;

    state.selectedDate = event.target.value;
    updateDateDisplay();
    loadScheduleForSelectedDate();
  });

  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", closeModal);

  document.getElementById("chooseTeamButton").addEventListener("click", () => {
    showToast("Výběr oblíbeného týmu přidáme v další verzi ICECORE.");
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
  });
}

/* -------------------- NAVIGATION -------------------- */

function showView(viewId) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.remove("active");
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.remove("active");
  });

  const view = document.getElementById(viewId);
  const navButton = document.querySelector(`[data-view="${viewId}"]`);

  if (view) view.classList.add("active");
  if (navButton) navButton.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewId === "liveView") {
    loadLiveData();
  }
}

/* -------------------- NHL DATA -------------------- */

async function loadAllData(manual = false) {
  setConnectionStatus("SYNCHRONIZACE");

  if (manual) {
    elements.refreshButton.style.transform = "rotate(360deg)";
    elements.refreshButton.style.transition = "transform 0.5s ease";
  }

  try {
    await Promise.all([
      loadScheduleForSelectedDate(),
      loadLiveData()
    ]);

    setConnectionStatus("ONLINE");
    if (manual) showToast("ICECORE byl aktualizován.");
  } catch (error) {
    console.error("ICECORE data error:", error);
    setConnectionStatus("OFFLINE");
  } finally {
    window.setTimeout(() => {
      elements.refreshButton.style.transform = "";
    }, 550);
  }
}

async function loadScheduleForSelectedDate() {
  elements.gamesList.innerHTML = loadingTemplate();

  try {
    const data = await fetchJson(
      `${NHL_API}/schedule/${state.selectedDate}`
    );

    const games = extractGamesFromSchedule(data, state.selectedDate);
    state.schedule = games;

    renderFeaturedGames(games);
    renderGamesList(games);

    return games;
  } catch (error) {
    console.error("Schedule error:", error);

    const errorHtml = errorTemplate(
      "Zápasy se momentálně nepodařilo načíst. Zkus obnovit data."
    );

    elements.gamesList.innerHTML = errorHtml;
    elements.featuredGames.innerHTML = errorHtml;

    throw error;
  }
}

async function loadLiveData() {
  try {
    const data = await fetchJson(`${NHL_API}/score/now`);

    const games = Array.isArray(data.games) ? data.games : [];
    state.liveGames = games.filter(isLiveGame);

    renderLiveGames(state.liveGames);

    // If today's schedule is available, update the CORE cards
    // with fresher live scores.
    if (isToday(state.selectedDate)) {
      const merged = mergeGames(state.schedule, games);
      if (merged.length) {
        renderFeaturedGames(merged);
      }
    }

    return games;
  } catch (error) {
    console.error("Live data error:", error);

    if (!state.liveGames.length) {
      elements.liveGames.innerHTML = errorTemplate(
        "Live monitor se momentálně nepodařilo připojit."
      );
    }

    throw error;
  }
}

async function fetchJson(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

/* -------------------- RENDERING -------------------- */

function renderFeaturedGames(games) {
  if (!games.length) {
    elements.featuredGames.innerHTML = emptyTemplate(
      "Dnes nejsou k dispozici žádné NHL zápasy."
    );
    return;
  }

  const priorityGames = [...games]
    .sort((a, b) => getGamePriority(b) - getGamePriority(a))
    .slice(0, 6);

  elements.featuredGames.innerHTML = priorityGames
    .map(createGameCard)
    .join("");

  bindGameCards(elements.featuredGames);
}

function renderGamesList(games) {
  if (!games.length) {
    elements.gamesList.innerHTML = emptyTemplate(
      "Pro tento den nejsou k dispozici žádné NHL zápasy."
    );
    return;
  }

  elements.gamesList.innerHTML = games
    .map(createGameListItem)
    .join("");

  bindGameCards(elements.gamesList);
}

function renderLiveGames(games) {
  if (!games.length) {
    elements.liveGames.innerHTML = emptyTemplate(
      "Právě teď neběží žádný NHL zápas."
    );
    return;
  }

  elements.liveGames.innerHTML = games
    .map(createGameCard)
    .join("");

  bindGameCards(elements.liveGames);
}

function createGameCard(game) {
  const home = getTeam(game.homeTeam);
  const away = getTeam(game.awayTeam);
  const status = getGameStatus(game);

  return `
    <article class="game-card ${status.live ? "live" : ""}"
             data-game-id="${escapeHtml(String(game.id))}">
      <div class="game-meta">
        <span class="game-state ${status.live ? "is-live" : ""}">
          ${status.live ? '<span class="live-dot"></span>' : ""}
          ${escapeHtml(status.label)}
        </span>
        <span class="game-state">${escapeHtml(getGamePeriod(game))}</span>
      </div>

      <div class="game-teams">
        ${teamCard(away)}
        <div class="score-block">
          <div class="score">
            ${getScore(away)} : ${getScore(home)}
          </div>
          <div class="vs">VS</div>
        </div>
        ${teamCard(home)}
      </div>

      <div class="game-footer">
        Otevřít GAME CENTER →
      </div>
    </article>
  `;
}

function teamCard(team) {
  return `
    <div class="team">
      <div class="team-logo-wrap">
        ${team.logo
          ? `<img class="team-logo" src="${escapeHtml(team.logo)}"
               alt="${escapeHtml(team.name)} logo"
               loading="lazy"
               onerror="this.style.display='none'">`
          : `<span>◈</span>`
        }
      </div>
      <span class="team-name">${escapeHtml(team.name)}</span>
    </div>
  `;
}

function createGameListItem(game) {
  const home = getTeam(game.homeTeam);
  const away = getTeam(game.awayTeam);
  const status = getGameStatus(game);

  return `
    <article class="game-list-item"
             data-game-id="${escapeHtml(String(game.id))}">
      <div class="list-team away">
        <strong>${escapeHtml(away.name)}</strong>
        ${teamLogo(away)}
      </div>

      <div class="list-score">
        ${getScore(away)} : ${getScore(home)}
        <small>${escapeHtml(status.label)}</small>
      </div>

      <div class="list-team">
        ${teamLogo(home)}
        <strong>${escapeHtml(home.name)}</strong>
      </div>
    </article>
  `;
}

function teamLogo(team) {
  if (!team.logo) {
    return `<span>◈</span>`;
  }

  return `
    <img src="${escapeHtml(team.logo)}"
         alt="${escapeHtml(team.name)}"
         loading="lazy"
         onerror="this.style.display='none'">
  `;
}

function bindGameCards(container) {
  container.querySelectorAll("[data-game-id]").forEach(card => {
    card.addEventListener("click", () => {
      openGameDetail(card.dataset.gameId);
    });
  });
}

/* -------------------- GAME DETAIL -------------------- */

async function openGameDetail(gameId) {
  if (!gameId) return;

  elements.gameModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  elements.gameDetailContent.innerHTML = loadingTemplate("Načítám GAME CENTER...");

  try {
    const data = await fetchJson(
      `${NHL_API}/gamecenter/${encodeURIComponent(gameId)}/landing`
    );

    renderGameDetail(data);
  } catch (error) {
    console.error("Game detail error:", error);

    elements.gameDetailContent.innerHTML = errorTemplate(
      "Detail zápasu se momentálně nepodařilo načíst."
    );
  }
}

function closeModal() {
  elements.gameModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderGameDetail(data) {
  const home = getTeam(data.homeTeam);
  const away = getTeam(data.awayTeam);
  const status = getGameStatus(data);

  const goals = extractGoals(data);

  elements.gameDetailContent.innerHTML = `
    <div class="detail-header">
      <p class="eyebrow">ICECORE GAME CENTER</p>

      <div class="game-teams">
        ${teamCard(away)}
        <div>
          <div class="detail-score">
            ${getScore(away)} : ${getScore(home)}
          </div>
          <div class="detail-status">
            ${escapeHtml(status.label)}
          </div>
        </div>
        ${teamCard(home)}
      </div>
    </div>

    <div class="goals-section">
      <h3>🏒 GÓLY A ASISTENCE</h3>

      ${
        goals.length
          ? goals.map(createGoalRow).join("")
          : `<div class="empty-state">
              <span>Zatím nejsou k dispozici žádné góly.</span>
            </div>`
      }
    </div>
  `;
}

function extractGoals(data) {
  // NHL gamecenter responses can contain summary data in different
  // structures. This safely supports the commonly available scoring data.
  const plays =
    data?.summary?.scoring ||
    data?.summary?.scoringPlays ||
    data?.scoring ||
    [];

  if (!Array.isArray(plays)) return [];

  const goals = [];

  plays.forEach(period => {
    const events = Array.isArray(period)
      ? period
      : period?.goals || period?.events || [];

    if (!Array.isArray(events)) return;

    events.forEach(event => {
      goals.push(event);
    });
  });

  return goals;
}

function createGoalRow(goal) {
  const scorer =
    goal?.scorer?.name?.default ||
    goal?.scorer?.name ||
    goal?.name?.default ||
    goal?.name ||
    "Střelec není k dispozici";

  const assists = [];

  if (Array.isArray(goal.assists)) {
    goal.assists.forEach(assist => {
      const name =
        assist?.name?.default ||
        assist?.name ||
        assist?.playerName?.default ||
        "";

      if (name) assists.push(name);
    });
  }

  const time =
    goal?.timeInPeriod ||
    goal?.time ||
    "—";

  const period =
    goal?.periodDescriptor?.number ||
    goal?.period ||
    "";

  const score =
    goal?.awayScore !== undefined && goal?.homeScore !== undefined
      ? `${goal.awayScore}:${goal.homeScore}`
      : "";

  return `
    <div class="goal-row">
      <div class="goal-time">
        ${escapeHtml(String(period))}. ${escapeHtml(String(time))}
      </div>

      <div>
        <div class="goal-player">${escapeHtml(String(scorer))}</div>
        <div class="goal-assists">
          ${assists.length
            ? `Asistence: ${escapeHtml(assists.join(", "))}`
            : "Bez asistence"
          }
        </div>
      </div>

      <div class="goal-score">${escapeHtml(score)}</div>
    </div>
  `;
}

/* -------------------- DATA HELPERS -------------------- */

function extractGamesFromSchedule(data, selectedDate) {
  if (!data) return [];

  // NHL schedule endpoint usually contains gameWeek.
  if (Array.isArray(data.gameWeek)) {
    const selectedDay = data.gameWeek.find(day =>
      day.date === selectedDate
    );

    if (selectedDay?.games && Array.isArray(selectedDay.games)) {
      return selectedDay.games;
    }
  }

  // Fallback for alternative response structures.
  if (Array.isArray(data.games)) {
    return data.games;
  }

  return [];
}

function mergeGames(scheduleGames, liveGames) {
  const liveMap = new Map(
    liveGames.map(game => [String(game.id), game])
  );

  return scheduleGames.map(game =>
    liveMap.get(String(game.id)) || game
  );
}

function getTeam(team) {
  if (!team) {
    return {
      name: "NHL",
      logo: "",
      score: "-"
    };
  }

  return {
    name:
      team.placeName?.default ||
      team.commonName?.default ||
      team.name?.default ||
      team.abbrev ||
      "NHL",

    logo:
      team.logo ||
      team.darkLogo ||
      team.lightLogo ||
      "",

    score: team.score
  };
}

function getScore(team) {
  if (!team || team.score === undefined || team.score === null) {
    return "–";
  }

  return String(team.score);
}

function getGameStatus(game) {
  const stateName = String(
    game.gameState ||
    game.gameScheduleState ||
    game.gameStateName ||
    ""
  ).toUpperCase();

  const live = [
    "LIVE",
    "CRIT",
    "IN_PROGRESS"
  ].includes(stateName);

  const finished = [
    "FINAL",
    "OFF",
    "OVER"
  ].includes(stateName);

  if (live) {
    return {
      live: true,
      label: "LIVE"
    };
  }

  if (finished) {
    return {
      live: false,
      label: "KONEC"
    };
  }

  if (game.startTimeUTC) {
    return {
      live: false,
      label: formatGameTime(game.startTimeUTC)
    };
  }

  return {
    live: false,
    label: "PLÁNOVÁNO"
  };
}

function getGamePeriod(game) {
  if (!isLiveGame(game)) return "";

  const period =
    game.periodDescriptor?.number ||
    game.period ||
    "";

  const time =
    game.clock?.timeRemaining ||
    game.timeRemaining ||
    "";

  if (period && time) {
    return `${period}. TŘ • ${time}`;
  }

  if (period) {
    return `${period}. TŘETINA`;
  }

  return "";
}

function isLiveGame(game) {
  return getGameStatus(game).live;
}

function getGamePriority(game) {
  if (isLiveGame(game)) return 100;

  const state = getGameStatus(game).label;

  if (state === "KONEC") return 50;

  return 10;
}

/* -------------------- DATE -------------------- */

function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);

  return localDate.toISOString().slice(0, 10);
}

function changeDate(days) {
  const date = new Date(`${state.selectedDate}T12:00:00`);
  date.setDate(date.getDate() + days);

  state.selectedDate = getLocalDateString(date);
  updateDateDisplay();
  loadScheduleForSelectedDate();
}

function updateDateDisplay() {
  elements.dateInput.value = state.selectedDate;

  const today = getLocalDateString();
  const tomorrow = getDateWithOffset(1);
  const yesterday = getDateWithOffset(-1);

  if (state.selectedDate === today) {
    elements.selectedDateText.textContent = "DNES";
  } else if (state.selectedDate === tomorrow) {
    elements.selectedDateText.textContent = "ZÍTRA";
  } else if (state.selectedDate === yesterday) {
    elements.selectedDateText.textContent = "VČERA";
  } else {
    elements.selectedDateText.textContent = "VYBRANÝ DEN";
  }

  elements.selectedDateValue.textContent =
    formatDate(state.selectedDate);
}

function getDateWithOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return getLocalDateString(date);
}

function isToday(dateString) {
  return dateString === getLocalDateString();
}

function formatDate(dateString) {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(`${dateString}T12:00:00`));
  } catch {
    return dateString;
  }
}

function formatGameTime(dateTime) {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(dateTime));
  } catch {
    return "PLÁNOVÁNO";
  }
}

/* -------------------- UI HELPERS -------------------- */

function loadingTemplate(text = "Načítám NHL data...") {
  return `
    <div class="loading-card">
      <div class="loader"></div>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function emptyTemplate(message) {
  return `
    <div class="empty-state">
      <div class="stats-icon">◈</div>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function errorTemplate(message) {
  return `
    <div class="empty-state">
      <div class="stats-icon">!</div>
      <span>${escapeHtml(message)}</span>
      <button class="primary-button" onclick="location.reload()">
        ZKUSIT ZNOVU
      </button>
    </div>
  `;
}

function setConnectionStatus(text) {
  elements.connectionText.textContent = text;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  window.clearTimeout(showToast.timer);

  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3500);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
