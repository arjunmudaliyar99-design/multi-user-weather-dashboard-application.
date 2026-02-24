const mongoose = require('mongoose');

const weatherSnapshotSchema = new mongoose.Schema({
  temperature: Number,
  feelsLike: Number,
  description: String,
  humidity: Number,
  windSpeed: Number,
  icon: String,
  recordedAt: { type: Date, default: Date.now },
}, { _id: false });

const citySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  cityName: {
    type: String,
    required: true,
  },
  country: {
    type: String,
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
  weatherHistory: {
    type: [weatherSnapshotSchema],
    default: [],
  },
  weatherInsights: {
    summary: { type: String, default: '' },
    prediction: { type: String, default: '' },
    alerts: { type: [String], default: [] },
    recommendation: { type: String, default: '' },
    lastUpdated: { type: Date },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

citySchema.index({ userId: 1, cityName: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('City', citySchema);
