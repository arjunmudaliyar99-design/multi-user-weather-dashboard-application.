const { ChatGroq } = require('@langchain/groq');
const { HumanMessage } = require('@langchain/core/messages');
const { StateGraph, END, START, Annotation } = require('@langchain/langgraph');

let model = null;
const getModel = () => {
  if (!model) {
    model = new ChatGroq({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return model;
};

const WeatherStateAnnotation = Annotation.Root({
  weather: Annotation(),
  forecast: Annotation(),
  history: Annotation(),
  summary: Annotation(),
  prediction: Annotation(),
  alerts: Annotation(),
  riskScore: Annotation(),
});

async function analyzeCurrentWeather(state) {
  const w = state.weather;
  const prompt = `You are a weather analysis AI. Analyze the following current weather data and provide a concise 2-3 sentence summary for a general user.

City: ${w.cityName || 'Unknown'}, ${w.country || ''}
Temperature: ${w.currentWeather?.temperature ?? 'N/A'}°C
Feels Like: ${w.currentWeather?.feelsLike ?? 'N/A'}°C
Condition: ${w.currentWeather?.description || 'N/A'}
Humidity: ${w.currentWeather?.humidity ?? 'N/A'}%
Wind Speed: ${w.currentWeather?.windSpeed ?? 'N/A'} km/h

Provide a friendly summary.`;

  const response = await getModel().invoke([new HumanMessage(prompt)]);
  return { summary: response.content };
}

async function analyzeForecast(state) {
  const forecast = state.forecast;
  if (!forecast || forecast.length === 0) {
    return { prediction: 'No forecast data available.' };
  }

  const forecastText = forecast
    .slice(0, 5)
    .map((f) => `${f.date}: High ${f.tempMax}°C / Low ${f.tempMin}°C, ${f.description}`)
    .join('\n');

  const prompt = `Based on this 5-day forecast, give a brief 2-sentence outlook for the coming days.

${forecastText}

Keep it conversational and helpful.`;

  const response = await getModel().invoke([new HumanMessage(prompt)]);
  return { prediction: response.content };
}

async function generateAlerts(state) {
  const w = state.weather;
  const temp = w.currentWeather?.temperature;
  const condition = (w.currentWeather?.description || '').toLowerCase();
  const aiAlerts = [];

  if (temp !== undefined && temp !== null) {
    if (temp >= 38) aiAlerts.push({ type: 'danger', message: '⚠ Extreme heat detected. Stay indoors and hydrate.' });
    else if (temp >= 33) aiAlerts.push({ type: 'warning', message: '🌡 High temperature. Avoid prolonged sun exposure.' });
    else if (temp <= 0) aiAlerts.push({ type: 'danger', message: '🧊 Freezing conditions. Risk of ice on roads.' });
    else if (temp <= 5) aiAlerts.push({ type: 'warning', message: '🧣 Very cold weather. Dress in layers.' });
  }

  if (condition.includes('thunder') || condition.includes('storm')) {
    aiAlerts.push({ type: 'danger', message: '⛈ Thunderstorm alert. Avoid open areas and tall structures.' });
  }
  if (condition.includes('rain') || condition.includes('drizzle')) {
    aiAlerts.push({ type: 'info', message: '🌧 Rain expected. Carry an umbrella.' });
  }
  if (condition.includes('snow') || condition.includes('blizzard')) {
    aiAlerts.push({ type: 'warning', message: '❄ Snowfall reported. Drive with caution.' });
  }
  if (condition.includes('fog') || condition.includes('mist')) {
    aiAlerts.push({ type: 'warning', message: '🌫 Low visibility due to fog. Slow down while driving.' });
  }

  return { alerts: aiAlerts };
}

async function calculateRiskScore(state) {
  const w = state.weather;
  const temp = w.currentWeather?.temperature ?? 20;
  const condition = (w.currentWeather?.description || '').toLowerCase();
  const alerts = state.alerts || [];

  let score = 0;

  if (temp >= 40 || temp <= -5) score += 40;
  else if (temp >= 35 || temp <= 0) score += 25;
  else if (temp >= 30 || temp <= 5) score += 10;

  if (condition.includes('thunder') || condition.includes('storm') || condition.includes('blizzard')) score += 35;
  else if (condition.includes('rain') || condition.includes('snow')) score += 20;
  else if (condition.includes('fog') || condition.includes('mist')) score += 15;
  else if (condition.includes('overcast') || condition.includes('cloud')) score += 5;

  score += Math.min(alerts.filter((a) => a.type === 'danger').length * 10, 20);

  const riskScore = Math.min(score, 100);
  let riskLabel = 'Low';
  if (riskScore >= 70) riskLabel = 'Critical';
  else if (riskScore >= 40) riskLabel = 'High';
  else if (riskScore >= 20) riskLabel = 'Moderate';

  return { riskScore: { score: riskScore, label: riskLabel } };
}

const workflow = new StateGraph(WeatherStateAnnotation)
  .addNode('analyzeCurrentWeather', analyzeCurrentWeather)
  .addNode('analyzeForecast', analyzeForecast)
  .addNode('generateAlerts', generateAlerts)
  .addNode('calculateRiskScore', calculateRiskScore)
  .addEdge(START, 'analyzeCurrentWeather')
  .addEdge('analyzeCurrentWeather', 'analyzeForecast')
  .addEdge('analyzeForecast', 'generateAlerts')
  .addEdge('generateAlerts', 'calculateRiskScore')
  .addEdge('calculateRiskScore', END);

const app = workflow.compile();

async function runWeatherGraph(input) {
  const result = await app.invoke({
    weather: input.weather || {},
    forecast: input.forecast || [],
    history: input.history || [],
    summary: '',
    prediction: '',
    alerts: [],
    riskScore: null,
  });

  return {
    summary: result.summary,
    prediction: result.prediction,
    alerts: result.alerts,
    riskScore: result.riskScore,
  };
}

module.exports = { runWeatherGraph };
