const API_URL = 'http://localhost:5000/api';

const getToken = () => localStorage.getItem('token');

const VC_ICON_MAP = {
  'clear-day': '☀️',
  'clear-night': '🌙',
  'partly-cloudy-day': '⛅',
  'partly-cloudy-night': '🌤️',
  'cloudy': '☁️',
  'fog': '🌫️',
  'wind': '💨',
  'rain': '🌧️',
  'showers-day': '🌦️',
  'showers-night': '🌧️',
  'thunder-rain': '⛈️',
  'thunder-showers-day': '⛈️',
  'thunder-showers-night': '⛈️',
  'snow': '❄️',
  'snow-showers-day': '🌨️',
  'snow-showers-night': '🌨️',
  'sleet': '🌨️',
};

const vcIcon = (icon) => VC_ICON_MAP[icon] || '🌤️';


document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) {
    window.location.href = 'index.html';
    return;
  }

  
  const savedUsername = localStorage.getItem('username');
  if (savedUsername) {
    setGreeting(savedUsername);
  }

  fetchUserProfile();
  fetchCities();

  document.getElementById('addCityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('cityInput');
    const cityName = input.value.trim();
    if (cityName) addCity(cityName);
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
  });
});


const setGreeting = (name) => {
  const el = document.getElementById('userGreeting');
  if (el) el.textContent = name;
  const avatar = document.getElementById('navAvatar');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
};

const fetchUserProfile = async () => {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const user = await res.json();
    const name = user.username || user.name || 'User';
    setGreeting(name);
    localStorage.setItem('username', name);
  } catch (e) {
    console.error('Profile fetch error:', e);
  }
};


const fetchCities = async () => {
  showLoading();
  try {
    const res = await fetch(`${API_URL}/cities`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
        return;
      }
      throw new Error('Failed to fetch cities');
    }
    const data = await res.json();
    renderFavoritesBadges(data.favorites);
    renderCities(data.cities);
    storeCitiesForChat(data.cities);
  } catch (e) {
    showError('Failed to load cities. Please try again.');
    console.error(e);
  }
};

const addCity = async (cityName) => {
  const btn = document.querySelector('#addCityForm .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    const res = await fetch(`${API_URL}/cities`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cityName }),
    });
    const data = await res.json();
    if (!res.ok) { showError(data.message || 'Failed to add city'); return; }
    document.getElementById('cityInput').value = '';
    await fetchCities();
  } catch (e) {
    showError('Failed to add city. Please try again.');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add City'; }
  }
};

window.toggleFavorite = async (cityId) => {
  try {
    const res = await fetch(`${API_URL}/cities/${cityId}/favorite`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Failed to update favorite');
    await fetchCities();
  } catch (e) {
    showError('Failed to update favorite.');
    console.error(e);
  }
};

window.deleteCity = async (cityId) => {
  try {
    const res = await fetch(`${API_URL}/cities/${cityId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Failed to delete city');
    await fetchCities();
  } catch (e) {
    showError('Failed to delete city.');
    console.error(e);
  }
};

const renderFavoritesBadges = (favorites) => {
  const container = document.getElementById('favoritesContainer');
  if (!favorites || favorites.length === 0) {
    container.innerHTML = '<span class="no-favorites">No favorites yet</span>';
    return;
  }
  container.innerHTML = favorites.map((city) => {
    const hasAlert = city.weatherInsights && city.weatherInsights.alerts && city.weatherInsights.alerts.length > 0;
    const alertHint = hasAlert ? ` ⚠ ${city.weatherInsights.alerts[0]}` : '';
    return `
      <button class="favorite-badge${hasAlert ? ' has-alert' : ''}" onclick="scrollToCity('${city._id}')" title="${city.cityName}${alertHint}">
        <span class="favorite-city-name">${city.cityName}</span>
        <span class="favorite-temp">${city.currentWeather.temperature !== null ? city.currentWeather.temperature + '°C' : 'N/A'}${hasAlert ? ' <span class="badge-alert-dot">⚠</span>' : ''}</span>
      </button>
    `;
  }).join('');
};

window.scrollToCity = (cityId) => {
  const card = document.getElementById(`city-${cityId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-flash');
    setTimeout(() => card.classList.remove('highlight-flash'), 1500);
  }
};

const renderCities = (cities) => {
  const container = document.getElementById('citiesContainer');
  if (!cities || cities.length === 0) {
    container.innerHTML = '<p class="empty-message">No cities added yet. Add your first city above!</p>';
    return;
  }
  container.innerHTML = cities.map((city) => buildCityCard(city)).join('');
};

const buildInsightsHtml = (insights) => {
  if (!insights || !insights.summary) return '';
  const alertsList = insights.alerts && insights.alerts.length
    ? `<ul class="insights-alerts-list">${insights.alerts.map((a) => `<li>⚠ ${a}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="insights-section">
      <div class="insights-header">✨ Weather Intelligence</div>
      <div class="insights-body">
        <div class="insights-row">
          <span class="insights-label">📌 Summary</span>
          <span class="insights-value">${insights.summary}</span>
        </div>
        <div class="insights-row">
          <span class="insights-label">📈 Prediction</span>
          <span class="insights-value">${insights.prediction}</span>
        </div>
        ${alertsList ? `<div class="insights-row"><span class="insights-label">⚠ Alerts</span><span class="insights-value">${alertsList}</span></div>` : ''}
        <div class="insights-row">
          <span class="insights-label">💡 Tip</span>
          <span class="insights-value insights-tip">${insights.recommendation}</span>
        </div>
      </div>
    </div>
  `;
};

const buildCityCard = (city) => {
  const w = city.currentWeather;
  const iconEmoji = vcIcon(w.icon);

  const alertsHtml = city.alerts && city.alerts.length
    ? `<div class="alerts-section">
        ${city.alerts.map((a) => `
          <div class="alert alert-${a.type}">${a.message}</div>
        `).join('')}
      </div>`
    : '';

  const forecastHtml = city.forecast && city.forecast.length
    ? `<div class="forecast-section">
        <h4>5-Day Forecast</h4>
        <div class="forecast-grid">
          ${city.forecast.map((day) => `
            <div class="forecast-day">
              <div class="forecast-date">${new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div class="forecast-icon-emoji">${vcIcon(day.icon)}</div>
              <div class="forecast-temps">
                <span class="temp-max">${day.maxTemp}°</span>
                <span class="temp-min">${day.minTemp}°</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`
    : '';

  const historyHtml = city.weatherHistory && city.weatherHistory.length
    ? `<div class="history-section">
        <h4>Weather History</h4>
        <div class="history-list">
          ${city.weatherHistory.map((h) => `
            <div class="history-item">
              <span class="history-time">${new Date(h.recordedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span class="history-temp">${h.temperature !== null ? h.temperature + '°C' : 'N/A'}</span>
              <span class="history-desc">${h.description || ''}</span>
            </div>
          `).join('')}
        </div>
      </div>`
    : '';

  return `
    <div id="city-${city._id}" class="city-card ${city.isFavorite ? 'is-favorite' : ''}">
      <div class="city-header">
        <div class="city-title">
          <h3>${city.cityName}${city.country ? ` <span class="city-country">${city.country}</span>` : ''}</h3>
        </div>
        ${city.isFavorite ? '<span class="favorite-star">★</span>' : ''}
      </div>
      <div class="current-weather-section">
        <div class="weather-main">
          <span class="weather-icon-emoji">${iconEmoji}</span>
          <p class="temperature">${w.temperature !== null ? w.temperature + '°C' : 'N/A'}</p>
        </div>
        <p class="description">${w.description || 'N/A'}</p>
        ${w.feelsLike != null ? `<p class="feels-like">Feels like ${w.feelsLike}°C</p>` : ''}
        <div class="weather-stats">
          ${w.humidity != null ? `<span>💧 ${w.humidity}%</span>` : ''}
          ${w.windSpeed != null ? `<span>💨 ${w.windSpeed} km/h</span>` : ''}
        </div>
      </div>
      ${alertsHtml}
      ${buildInsightsHtml(city.weatherInsights)}
      ${forecastHtml}
      ${historyHtml}
      <div class="city-actions">
        <button class="btn-favorite ${city.isFavorite ? 'active' : ''}" onclick="toggleFavorite('${city._id}')">
          ${city.isFavorite ? '★ Favorited' : '☆ Favorite'}
        </button>
        <button class="btn-delete" onclick="deleteCity('${city._id}')">Delete</button>
      </div>
    </div>
  `;
};

const showLoading = () => {
  document.getElementById('citiesContainer').innerHTML =
    '<p class="loading-message">Loading cities…</p>';
};

const showError = (message) => {
  const el = document.getElementById('errorMessage');
  if (!el) return;
  el.textContent = message;
  setTimeout(() => { el.textContent = ''; }, 4000);
};

let chatCitiesContext = [];

const storeCitiesForChat = (cities) => {
  chatCitiesContext = (cities || []).map((c) => ({
    name: c.cityName,
    country: c.country,
    temp: c.currentWeather?.temperature,
    condition: c.currentWeather?.description,
    humidity: c.currentWeather?.humidity,
    windSpeed: c.currentWeather?.windSpeed,
    insights: c.weatherInsights || null,
  }));
};

const chatOpen = () => {
  document.getElementById('chatWindow').classList.add('open');
  document.getElementById('chatInput').focus();
};

const chatClose = () => {
  document.getElementById('chatWindow').classList.remove('open');
};

const chatAppend = (role, text) => {
  const list = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.innerHTML = `<span class="chat-bubble">${text.replace(/\n/g, '<br>')}</span>`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
};

const chatSend = async () => {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  chatAppend('user', message);

  const typing = document.createElement('div');
  typing.className = 'chat-msg chat-msg-bot';
  typing.id = 'chatTyping';
  typing.innerHTML = '<span class="chat-bubble chat-typing"><span></span><span></span><span></span></span>';
  document.getElementById('chatMessages').appendChild(typing);
  document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;

  try {
    const res = await fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, cities: chatCitiesContext }),
    });
    const data = await res.json();
    document.getElementById('chatTyping')?.remove();
    if (!res.ok) { chatAppend('bot', `❌ ${data.message || 'Error from server'}`); return; }
    chatAppend('bot', data.reply);
  } catch (e) {
    document.getElementById('chatTyping')?.remove();
    chatAppend('bot', '❌ Failed to reach AI. Check your connection.');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.addEventListener('click', chatSend);
  const chatInputEl = document.getElementById('chatInput');
  if (chatInputEl) chatInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend(); } });
  const toggleBtn = document.getElementById('chatToggleBtn');
  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    document.getElementById('chatWindow').classList.contains('open') ? chatClose() : chatOpen();
  });
  const closeBtn = document.getElementById('chatCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', chatClose);
});

