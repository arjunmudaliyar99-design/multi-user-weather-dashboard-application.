const express = require('express');
const axios = require('axios');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const City = require('../models/City');
const { runWeatherGraph } = require('../ai/graph');
const { ChatGroq } = require('@langchain/groq');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

const getChatModel = () => new ChatGroq({
  model: 'llama-3.1-8b-instant',
  temperature: 0.5,
  apiKey: process.env.GROQ_API_KEY,
});

const VC_BASE =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

router.get('/ai/weather-analysis/:cityName', authMiddleware, async (req, res) => {
  try {
    const { cityName } = req.params;

    const cityDoc = await City.findOne({
      userId: req.userId,
      cityName: { $regex: new RegExp(`^${cityName}$`, 'i') },
    });

    if (!cityDoc) {
      return res.status(404).json({ message: `City "${cityName}" not found in your dashboard.` });
    }

    let weatherData;
    try {
      const { data } = await axios.get(`${VC_BASE}/${encodeURIComponent(cityDoc.cityName)}`, {
        params: {
          unitGroup: 'metric',
          key: process.env.WEATHER_API_KEY,
          contentType: 'json',
          include: 'current,days',
        },
      });
      weatherData = data;
    } catch {
      return res.status(502).json({ message: 'Failed to fetch weather data for AI analysis.' });
    }

    const current = weatherData.currentConditions;

    const weatherInput = {
      cityName: cityDoc.cityName,
      country: cityDoc.country,
      currentWeather: {
        temperature: Math.round(current.temp),
        feelsLike: Math.round(current.feelslike),
        description: current.conditions,
        humidity: current.humidity,
        windSpeed: Math.round(current.windspeed),
        icon: current.icon,
      },
    };

    const forecastInput = weatherData.days.slice(1, 6).map((day) => ({
      date: day.datetime,
      tempMin: Math.round(day.tempmin),
      tempMax: Math.round(day.tempmax),
      description: day.conditions,
    }));

    const historyInput = cityDoc.weatherHistory || [];

    const aiResult = await runWeatherGraph({
      weather: weatherInput,
      forecast: forecastInput,
      history: historyInput,
    });

    res.json({
      success: true,
      city: cityDoc.cityName,
      country: cityDoc.country,
      currentWeather: weatherInput.currentWeather,
      aiSummary: aiResult.summary,
      aiPrediction: aiResult.prediction,
      aiAlerts: aiResult.alerts,
      riskScore: aiResult.riskScore,
    });
  } catch (error) {
    console.error('AI analysis error:', error.message);
    res.status(500).json({ message: 'AI analysis failed.', error: error.message });
  }
});

router.post('/ai/chat', authMiddleware, async (req, res) => {
  try {
    const { message, cities } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required' });

    let contextBlock = 'The user has no cities tracked yet.';
    if (cities && cities.length > 0) {
      contextBlock = cities.map((c) => {
        let line = `- ${c.name}${c.country ? ', ' + c.country : ''}: ${c.temp != null ? c.temp + '\u00b0C' : 'N/A'}, ${c.condition || 'N/A'}, humidity ${c.humidity != null ? c.humidity + '%' : 'N/A'}, wind ${c.windSpeed != null ? c.windSpeed + ' km/h' : 'N/A'}.`;
        if (c.insights) {
          if (c.insights.prediction) line += ` Prediction: ${c.insights.prediction}`;
          if (c.insights.alerts && c.insights.alerts.length) line += ` Alerts: ${c.insights.alerts.join(', ')}.`;
          if (c.insights.recommendation) line += ` Tip: ${c.insights.recommendation}`;
        }
        return line;
      }).join('\n');
    }

    const systemPrompt = `You are a friendly and knowledgeable weather assistant integrated into a personal weather dashboard. 
You have access to the user's tracked cities and their current weather data listed below. 
Answer questions clearly and helpfully. Keep responses concise (2-4 sentences unless detail is needed). 
If asked about a city not in the list, say you don't have data for it but provide general knowledge.

User's tracked cities:
${contextBlock}`;

    const chatModel = getChatModel();
    const response = await chatModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
    ]);

    res.json({ reply: response.content });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ message: 'Chat failed.', error: error.message });
  }
});

module.exports = router;
