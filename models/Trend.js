
const mongoose = require('mongoose');

const trendSchema = new mongoose.Schema({
  hashtag: {
    type: String,
    required: true,
    unique: true
  },
  tweetCount: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    default: 'Trending'
  }
}, { timestamps: true });

// Index for faster queries
trendSchema.index({ tweetCount: -1 });

module.exports = mongoose.model('Trend', trendSchema);
