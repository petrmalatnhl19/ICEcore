"use strict";

/* ============================================================
ICECORE — NHL LIVE DATA ENGINE
============================================================ */

const NHL_API = "https://api-web.nhle.com/v1";

const state = {
selectedDate: getLocalDateString(),
games: [],
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

/* ============================================================
START APLIKACE
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
bindEvents();
updateDateDisplay();
loadAllData();

state.refreshTimer = window.setInterval(() => {
if (isToday(state.selectedDate)) {
loadAllData(false);
}
}, 30000);
});

/* ============================================================
NAVIGACE A OVLÁDÁNÍ
============================================================ */

function bindEvents() {
document.querySelectorAll(".nav-item").forEach(button => {
button.addEventListener("click", () => {
showView(button.dataset.view);
});
});

document.querySelectorAll("[data-action='games']").forEach(button => {
button.addEventListener("click", () => {
showView("gamesView");
});
});

const homeButton = document.getElementById("homeButton");

if (homeButton) {
homeButton.addEventListener("click", () => {
showView("coreView");
});
}

if (elements.refreshButton) {
elements.refreshButton.addEventListener("click", () => {
loadAllData(true);
});
}

const previousDay = document.getElementById("previousDay");
const nextDay = document.getElementById("nextDay");
const datePickerButton = document.getElementById("datePickerButton");

if (previousDay) {
previousDay.addEventListener("click", () => changeDate(-1));
}

if (nextDay) {
nextDay.addEventListener("click", () => changeDate(1));
}

if (datePickerButton && elements.dateInput) {
datePickerButton.addEventListener("click", () => {
if (typeof elements.dateInput.showPicker === "function") {
elements.dateInput.showPicker();
} else {
elements.dateInput.click();
}
});
}

if (elements.dateInput) {
elements.dateInput.addEventListener("change", event => {
if (!event.target.value) return;

  state.selectedDate = event.target.value;
  updateDateDisplay();
  loadAllData(false);
});

}

const closeButton = document.getElementById("closeModal");
const backdrop = document.getElementById("modalBackdrop");

if (closeButton) {
closeButton.addEventListener("click", closeModal);
}

if (backdrop) {
backdrop.addEventListener("click", closeModal);
}

const chooseTeamButton = document.getElementById("chooseTeamButton");

if (chooseTeamButton) {
chooseTeamButton.addEventListener("click", () => {
showToast("Výběr oblíbeného týmu přidáme v další verzi ICECORE.");
});
}

document.addEventListener("keydown", event => {
if (event.key === "Escape") {
closeModal();
}
});
}

function showView(viewId) {
document.querySelectorAll(".view").forEach(view => {
view.classList.remove("active");
});

document.querySelectorAll(".nav-item").forEach(button => {
button.classList.remove("active");
});

const selectedView = document.getElementById(viewId);
const selectedNav = document.querySelector("[data-view="${viewId}"]");

if (selectedView) {
selectedView.classList.add("active");
}

if (selectedNav) {
selectedNav.classList.add("active");
}

window.scrollTo({
top: 0,
behavior: "smooth"
});
}

/* ============================================================
NHL DATA
============================================================ */

async function loadAllData(manual = false) {
setConnectionStatus("SYNCHRONIZACE");

if (manual && elements.refreshButton) {
elements.refreshButton.classList.add("is-refreshing");
}

try {
await loadGamesForSelectedDate();
setConnectionStatus("ONLINE");

if (manual) {
  showToast("ICECORE byl aktualizován.");
}

} catch (error) {
console.error("ICECORE NHL API chyba:", error);

setConnectionStatus("OFFLINE");
renderDataError("NHL data se momentálně nepodařilo načíst.");

if (manual) {
  showToast("Připojení k NHL datům se nepodařilo.");
}

} finally {
if (elements.refreshButton) {
window.setTimeout(() => {
elements.refreshButton.classList.remove("is-refreshing");
}, 500);
}
}
}

async function loadGamesForSelectedDate() {
showLoadingState();

const url = "${NHL_API}/score/${state.selectedDate}";
const data = await fetchJson(url);

const games = Array.isArray(data.games) ? data.games : [];

state.games = games;
state.liveGames = games.filter(isLiveGame);

renderFeaturedGames(games);
renderGamesList(games);
renderLiveGames(state.liveGames);

return games;
}

async function fetchJson(url, timeout = 12000) {
const controller = new AbortController();

const timeoutId = window.setTimeout(() => {
controller.abort();
}, timeout);

try {
const response = await fetch(url, {
method: "GET",
signal: controller.signal,
headers: {
Accept: "application/json"
}
});

if (!response.ok) {
  throw new Error(`NHL API odpovědělo chybou: ${response.status}`);
}

return await response.json();

} finally {
window.clearTimeout(timeoutId);
}
}

/* ============================================================
VYKRESLENÍ ZÁPASŮ
============================================================ */

function showLoadingState() {
if (elements.featuredGames) {
elements.featuredGames.innerHTML =
loadingTemplate("Načítám dnešní NHL zápasy...");
}

if (elements.gamesList) {
elements.gamesList.innerHTML =
loadingTemplate("Načítám rozpis NHL...");
}

if (elements.liveGames) {
elements.liveGames.innerHTML =
loadingTemplate("Kontroluji LIVE zápasy...");
}
}

function renderFeaturedGames(games) {
if (!elements.featuredGames) return;

if (!games.length) {
elements.featuredGames.innerHTML = emptyTemplate(
"Pro tento den nejsou naplánovány žádné NHL zápasy."
);
return;
}

const sortedGames = [...games]
.sort((a, b) => getGamePriority(b) - getGamePriority(a))
.slice(0, 6);

elements.featuredGames.innerHTML = sortedGames
.map(createGameCard)
.join("");

bindGameCards(elements.featuredGames);
}

function renderGamesList(games) {
if (!elements.gamesList) return;

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
if (!elements.liveGames) return;

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
const period = getGamePeriod(game);

return `
<article class="game-card ${status.live ? "live" : ""}"
data-game-id="${escapeHtml(String(game.id))}">

  <div class="game-meta">
    <span class="game-state ${status.live ? "is-live" : ""}">
      ${status.live ? '<span class="live-dot"></span>' : ""}
      ${escapeHtml(status.label)}
    </span>

    <span class="game-state">
      ${escapeHtml(period)}
    </span>
  </div>

  <div class="game-teams">
    ${teamCard(away)}

    <div class="score-block">
      <div class="score">
        ${getScore(away)} : ${getScore(home)}
      </div>
      <div class="vs">
        ${status.finished ? "FINAL" : "VS"}
      </div>
    </div>

    ${teamCard(home)}
  </div>

  <div class="game-footer">
    OTEVŘÍT GAME CENTER →
  </div>

</article>

`;
}

function teamCard(team) {
return "<div class="team"> <div class="team-logo-wrap"> ${ team.logo ?"<img class="team-logo"
src="${escapeHtml(team.logo)}"
alt="${escapeHtml(team.name)} logo"
loading="lazy"
onerror="this.style.display='none'">":"<span>◈</span>`
}
</div>

  <span class="team-name">
    ${escapeHtml(team.name)}
  </span>
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
return "<span>◈</span>";
}

return "<img src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)}" loading="lazy" onerror="this.style.display='none'">";
}

function bindGameCards(container) {
container.querySelectorAll("[data-game-id]").forEach(card => {
card.addEventListener("click", () => {
openGameDetail(card.dataset.gameId);
});
});
}

/* ============================================================
DETAIL ZÁPASU
============================================================ */

async function openGameDetail(gameId) {
if (!gameId || !elements.gameModal) return;

elements.gameModal.classList.remove("hidden");
document.body.style.overflow = "hidden";

if (elements.gameDetailContent) {
elements.gameDetailContent.innerHTML =
loadingTemplate("Načítám ICECORE GAME CENTER...");
}

try {
const data = await fetchJson(
"${NHL_API}/gamecenter/${encodeURIComponent(gameId)}/landing"
);

renderGameDetail(data);

} catch (error) {
console.error("Chyba detailu zápasu:", error);

if (elements.gameDetailContent) {
  elements.gameDetailContent.innerHTML = errorTemplate(
    "Detail zápasu se momentálně nepodařilo načíst."
  );
}

}
}

function closeModal() {
if (!elements.gameModal) return;

elements.gameModal.classList.add("hidden");
document.body.style.overflow = "";
}

function renderGameDetail(data) {
if (!elements.gameDetailContent) return;

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
      : emptyTemplate(
          "Zatím nejsou k dispozici žádné góly nebo podrobnosti o skórování."
        )
  }
</div>

`;
}

function extractGoals(data) {
const scoring = data?.summary?.scoring || data?.scoring || [];

if (!Array.isArray(scoring)) {
return [];
}

const goals = [];

scoring.forEach(item => {
if (Array.isArray(item?.goals)) {
item.goals.forEach(goal => {
goals.push({
...goal,
period:
goal.period ||
item.periodDescriptor?.number ||
item.period
});
});
return;
}

if (item?.scorer || item?.name || item?.timeInPeriod) {
  goals.push(item);
}

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

if (Array.isArray(goal?.assists)) {
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
goal?.awayScore !== undefined &&
goal?.homeScore !== undefined
? "${goal.awayScore}:${goal.homeScore}"
: "";

return `
<div class="goal-row">
<div class="goal-time">
${escapeHtml(String(period || "—"))}.
${escapeHtml(String(time))}
</div>

  <div>
    <div class="goal-player">
      ${escapeHtml(String(scorer))}
    </div>

    <div class="goal-assists">
      ${
        assists.length
          ? `Asistence: ${escapeHtml(assists.join(", "))}`
          : "Bez asistence"
      }
    </div>
  </div>

  <div class="goal-score">
    ${escapeHtml(score)}
  </div>
</div>

`;
}

/* ============================================================
NHL POMOCNÉ FUNKCE
============================================================ */

function getTeam(team) {
if (!team) {
return {
name: "NHL",
logo: "",
score: null
};
}

const placeName =
team.placeName?.default ||
"";

const commonName =
team.commonName?.default ||
"";

const fullName =
team.name?.default ||
[placeName, commonName]
.filter(Boolean)
.join(" ") ||
team.abbrev ||
"NHL";

return {
name: fullName,
logo:
team.logo ||
team.darkLogo ||
team.lightLogo ||
"",
score: team.score
};
}

function getScore(team) {
if (
!team ||
team.score === undefined ||
team.score === null
) {
return "–";
}

return String(team.score);
}

function getGameStatus(game) {
const gameState = String(
game?.gameState ||
game?.gameScheduleState ||
""
).toUpperCase();

const liveStates = ["LIVE", "CRIT", "IN_PROGRESS"];
const finalStates = ["FINAL", "OFF", "OVER"];

if (liveStates.includes(gameState)) {
return {
live: true,
finished: false,
label: "LIVE"
};
}

if (finalStates.includes(gameState)) {
return {
live: false,
finished: true,
label: "KONEC"
};
}

if (game?.startTimeUTC) {
return {
live: false,
finished: false,
label: formatGameTime(game.startTimeUTC)
};
}

return {
live: false,
finished: false,
label: "PLÁNOVÁNO"
};
}

function getGamePeriod(game) {
if (!isLiveGame(game)) {
return "";
}

const period =
game?.periodDescriptor?.number ||
game?.period ||
"";

const time =
game?.clock?.timeRemaining ||
game?.timeRemaining ||
"";

if (period && time) {
return "${period}. TŘ • ${time}";
}

if (period) {
return "${period}. TŘETINA";
}

return "";
}

function isLiveGame(game) {
return getGameStatus(game).live;
}

function getGamePriority(game) {
const status = getGameStatus(game);

if (status.live) return 100;
if (status.finished) return 50;

return 10;
}

/* ============================================================
DATUM A ČAS
============================================================ */

function getLocalDateString(date = new Date()) {
const local = new Date(
date.getTime() - date.getTimezoneOffset() * 60000
);

return local.toISOString().slice(0, 10);
}

function changeDate(days) {
const date = new Date(
"${state.selectedDate}T12:00:00"
);

date.setDate(date.getDate() + days);

state.selectedDate = getLocalDateString(date);

updateDateDisplay();
loadAllData(false);
}

function updateDateDisplay() {
if (elements.dateInput) {
elements.dateInput.value = state.selectedDate;
}

const today = getLocalDateString();
const tomorrow = getDateWithOffset(1);
const yesterday = getDateWithOffset(-1);

if (elements.selectedDateText) {
if (state.selectedDate === today) {
elements.selectedDateText.textContent = "DNES";
} else if (state.selectedDate === tomorrow) {
elements.selectedDateText.textContent = "ZÍTRA";
} else if (state.selectedDate === yesterday) {
elements.selectedDateText.textContent = "VČERA";
} else {
elements.selectedDateText.textContent = "VYBRANÝ DEN";
}
}

if (elements.selectedDateValue) {
elements.selectedDateValue.textContent =
formatDate(state.selectedDate);
}
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
}).format(
new Date("${dateString}T12:00:00")
);
} catch {
return dateString;
}
}

function formatGameTime(dateTime) {
try {
return new Intl.DateTimeFormat("cs-CZ", {
hour: "2-digit",
minute: "2-digit",
timeZone: "Europe/Prague"
}).format(new Date(dateTime));
} catch {
return "PLÁNOVÁNO";
}
}

/* ============================================================
UI STAVY
============================================================ */

function renderDataError(message) {
const html = errorTemplate(message);

if (elements.featuredGames) {
elements.featuredGames.innerHTML = html;
}

if (elements.gamesList) {
elements.gamesList.innerHTML = html;
}

if (elements.liveGames) {
elements.liveGames.innerHTML = html;
}
}

function loadingTemplate(message = "Načítám NHL data...") {
return "<div class="loading-card"> <div class="loader"></div> <span>${escapeHtml(message)}</span> </div>";
}

function emptyTemplate(message) {
return "<div class="empty-state"> <div class="stats-icon">◈</div> <span>${escapeHtml(message)}</span> </div>";
}

function errorTemplate(message) {
return "<div class="empty-state"> <div class="stats-icon">!</div> <span>${escapeHtml(message)}</span> <button class="primary-button" onclick="location.reload()"> ZKUSIT ZNOVU </button> </div>";
}

function setConnectionStatus(text) {
if (elements.connectionText) {
elements.connectionText.textContent = text;
}
}

function showToast(message) {
if (!elements.toast) return;

elements.toast.textContent = message;
elements.toast.classList.add("show");

window.clearTimeout(showToast.timer);

showToast.timer = window.setTimeout(() => {
elements.toast.classList.remove("show");
}, 3500);
}

function escapeHtml(value) {
return String(value)
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, """)
.replace(/'/g, "'");
}
