
const express = require('express');
const Trend = require('../models/Trend');

const router = express.Router();

/**
 * @route   GET /api/trends
 * @desc    Get trending topics
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const trends = await Trend.find()
      .sort({ tweetCount: -1 })
      .limit(10);
    
    // If no trends in database, return sample trends
    if (trends.length === 0) {
      const sampleTrends = [
        { _id: '1', hashtag: '#ChirpSocial', tweetCount: 5243, category: 'Technology' },
        { _id: '2', hashtag: '#WebDevelopment', tweetCount: 3721, category: 'Programming' },
        { _id: '3', hashtag: '#JavaScript', tweetCount: 2845, category: 'Programming' },
        { _id: '4', hashtag: '#ReactJS', tweetCount: 2103, category: 'Programming' },
        { _id: '5', hashtag: '#NodeJS', tweetCount: 1876, category: 'Programming' },
        { _id: '6', hashtag: '#NextJS', tweetCount: 1654, category: 'Programming' },
        { _id: '7', hashtag: '#MongoDB', tweetCount: 1432, category: 'Database' },
        { _id: '8', hashtag: '#TailwindCSS', tweetCount: 1298, category: 'Design' },
        { _id: '9', hashtag: '#FullStack', tweetCount: 1187, category: 'Technology' },
        { _id: '10', hashtag: '#CodingLife', tweetCount: 965, category: 'Lifestyle' }
      ];
      
      return res.json(sampleTrends);
    }
    
    res.json(trends);
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
