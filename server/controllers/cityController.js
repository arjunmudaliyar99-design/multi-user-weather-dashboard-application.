const axios = require('axios');
const City = require('../models/City');

const VC_BASE = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

const fetchWeatherData = async (cityName) => {
  const { data } = await axios.get(`${VC_BASE}/${encodeURIComponent(cityName)}`, {
    params: {
      unitGroup: 'metric',
      key: process.env.WEATHER_API_KEY,
      contentType: 'json',
      include: 'current,days',
    },
  });
  return data;
};

const buildForecastDays = (days) => {
  return days.slice(1, 6).map((day) => ({
    date: day.datetime,
    minTemp: Math.round(day.tempmin),
    maxTemp: Math.round(day.tempmax),
    description: day.conditions,
    icon: day.icon,
  }));
};

const computeInsights = (current, days) => {
  const temp = current.temp;
  const humidity = current.humidity;
  const condition = (current.conditions || '').toLowerCase();
  const alerts = [];
  let summary = '';
  let prediction = '';
  let recommendation = '';

  if (temp > 35) alerts.push('High heat warning');
  if (temp < 10) alerts.push('Cold weather alert');
  if (humidity > 80) alerts.push('High humidity discomfort expected');

  const forecastDays = days.slice(1, 6);
  const hasRainForecast = forecastDays.some((d) =>
    (d.conditions || '').toLowerCase().includes('rain') ||
    (d.conditions || '').toLowerCase().includes('shower') ||
    (d.precipprob != null && d.precipprob > 50)
  );
  if (hasRainForecast) alerts.push('Rain expected in coming days');

  const isRaining = condition.includes('rain') || condition.includes('drizzle') || condition.includes('shower');
  const isStormy = condition.includes('thunder') || condition.includes('storm');
  const isSnowy = condition.includes('snow') || condition.includes('blizzard');
  const isFoggy = condition.includes('fog') || condition.includes('mist');
  const isClear = condition.includes('clear') || condition.includes('sun');

  if (isStormy) alerts.push('Thunderstorm warning');
  if (isSnowy) alerts.push('Snowfall alert');
  if (isFoggy) alerts.push('Low visibility warning');

  if (temp > 40) summary = `Extreme heat at ${Math.round(temp)}°C — dangerous outdoor conditions.`;
  else if (temp > 35) summary = `Very hot at ${Math.round(temp)}°C with ${condition}. Humidity at ${humidity}%.`;
  else if (temp > 25) summary = `Warm day at ${Math.round(temp)}°C with ${condition}. Humidity is ${humidity}%.`;
  else if (temp > 15) summary = `Pleasant ${Math.round(temp)}°C with ${condition}. Humidity at ${humidity}%.`;
  else if (temp > 5) summary = `Cool weather at ${Math.round(temp)}°C. ${condition}. Humidity is ${humidity}%.`;
  else summary = `Cold conditions at ${Math.round(temp)}°C with ${condition}. Stay warm.`;

  const temps = forecastDays.map((d) => d.tempmax);
  const firstTemp = temps[0];
  const lastTemp = temps[temps.length - 1];
  const tempDiff = lastTemp - firstTemp;
  if (hasRainForecast && tempDiff < -2) prediction = 'Rain likely with a cooling trend over the next few days.';
  else if (hasRainForecast) prediction = 'Rain likely in coming days.';
  else if (tempDiff > 3) prediction = 'Warming trend expected over the next few days.';
  else if (tempDiff < -3) prediction = 'Cooling trend expected over the next few days.';
  else prediction = 'Temperatures expected to remain stable over the next few days.';

  if (isStormy) recommendation = 'Avoid outdoor activity. Stay indoors during the storm.';
  else if (isRaining || hasRainForecast) recommendation = 'Carry an umbrella when going out.';
  else if (isSnowy) recommendation = 'Wear warm clothing and drive with caution.';
  else if (isFoggy) recommendation = 'Drive slowly — low visibility expected.';
  else if (temp > 35) recommendation = 'Avoid outdoor activity in the afternoon. Stay hydrated.';
  else if (temp < 10) recommendation = 'Wear warm clothing when going outside.';
  else if (isClear && temp >= 15 && temp <= 30) recommendation = 'Great conditions for outdoor activity.';
  else recommendation = 'Weather conditions are favorable.';

  return { summary, prediction, alerts, recommendation, lastUpdated: new Date() };
};

const generateAlerts = (current, days) => {
  const alerts = [];
  const temp = current.temp;
  const condition = (current.conditions || '').toLowerCase();

  if (temp > 35) {
    alerts.push({ type: 'danger', message: '🌡️ High temperature warning — stay hydrated' });
  }
  if (temp < 10) {
    alerts.push({ type: 'info', message: '🥶 Cold weather warning — dress warmly' });
  }

  const hasRain = days.slice(0, 5).some(
    (d) => (d.conditions || '').toLowerCase().includes('rain')
  );
  if (hasRain) {
    alerts.push({ type: 'info', message: '🌧️ Rain expected in the coming days' });
  }

  if ((condition.includes('clear') || condition.includes('sun')) && temp > 30) {
    alerts.push({ type: 'warning', message: '☀️ High sunlight exposure — use sunscreen' });
  }

  return alerts;
};

const addCity = async (req, res) => {
  try {
    const { cityName } = req.body;
    if (!cityName) {
      return res.status(400).json({ message: 'City name is required' });
    }

    const exists = await City.findOne({
      userId: req.userId,
      cityName: { $regex: new RegExp(`^${cityName}$`, 'i') },
    });
    if (exists) {
      return res.status(400).json({ message: 'City already added' });
    }

    let weatherData;
    try {
      weatherData = await fetchWeatherData(cityName);
    } catch {
      return res.status(400).json({ message: 'City not found. Please check the city name.' });
    }

    const current = weatherData.currentConditions;
    const snapshot = {
      temperature: Math.round(current.temp),
      feelsLike: Math.round(current.feelslike),
      description: current.conditions,
      humidity: current.humidity,
      windSpeed: Math.round(current.windspeed),
      icon: current.icon,
      recordedAt: new Date(),
    };

    const resolvedName = weatherData.resolvedAddress
      ? weatherData.resolvedAddress.split(',')[0].trim()
      : cityName;

    const city = await City.create({
      userId: req.userId,
      cityName: resolvedName,
      country: weatherData.resolvedAddress
        ? weatherData.resolvedAddress.split(',').pop().trim()
        : '',
      isFavorite: false,
      weatherHistory: [snapshot],
    });

    res.status(201).json(city);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCities = async (req, res) => {
  try {
    const cities = await City.find({ userId: req.userId }).sort({ createdAt: -1 });

    const citiesWithWeather = await Promise.all(
      cities.map(async (city) => {
        try {
          const weatherData = await fetchWeatherData(city.cityName);
          const current = weatherData.currentConditions;

          const currentWeather = {
            temperature: Math.round(current.temp),
            feelsLike: Math.round(current.feelslike),
            description: current.conditions,
            humidity: current.humidity,
            windSpeed: Math.round(current.windspeed),
            icon: current.icon,
          };

          const snapshot = { ...currentWeather, recordedAt: new Date() };
          city.weatherHistory.push(snapshot);
          if (city.weatherHistory.length > 10) {
            city.weatherHistory = city.weatherHistory.slice(-10);
          }
          const insights = computeInsights(current, weatherData.days);
          city.weatherInsights = insights;
          await city.save();

          return {
            _id: city._id,
            cityName: city.cityName,
            country: city.country,
            isFavorite: city.isFavorite,
            currentWeather,
            forecast: buildForecastDays(weatherData.days),
            alerts: generateAlerts(current, weatherData.days),
            weatherHistory: city.weatherHistory.slice().reverse().slice(0, 7),
            weatherInsights: insights,
          };
        } catch {
          return {
            _id: city._id,
            cityName: city.cityName,
            country: city.country,
            isFavorite: city.isFavorite,
            currentWeather: { temperature: null, description: 'unavailable' },
            forecast: [],
            alerts: [],
            weatherHistory: city.weatherHistory.slice().reverse().slice(0, 7),
            weatherInsights: city.weatherInsights || null,
          };
        }
      })
    );

    const favorites = citiesWithWeather.filter((c) => c.isFavorite);
    res.json({ favorites, cities: citiesWithWeather });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleFavorite = async (req, res) => {
  try {
    const city = await City.findOne({ _id: req.params.id, userId: req.userId });
    if (!city) {
      return res.status(404).json({ message: 'City not found' });
    }
    city.isFavorite = !city.isFavorite;
    await city.save();
    res.json(city);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCity = async (req, res) => {
  try {
    const city = await City.findOne({ _id: req.params.id, userId: req.userId });
    if (!city) {
      return res.status(404).json({ message: 'City not found' });
    }
    await city.deleteOne();
    res.json({ message: 'City removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addCity, getCities, toggleFavorite, deleteCity };

