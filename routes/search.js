
const express = require('express');
const User = require('../models/User');
const Tweet = require('../models/Tweet');

const router = express.Router();

/**
 * @route   GET /api/search
 * @desc    Search for tweets and users
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    // Search for tweets
    const tweets = await Tweet.find({
      content: { $regex: q, $options: 'i' }
    })
    .populate('user', 'name username profileImage')
    .sort({ createdAt: -1 })
    .limit(50);
    
    // Format tweets for response
    const formattedTweets = tweets.map(tweet => {
      const isLiked = req.user ? tweet.likes.includes(req.user._id) : false;
      const isRetweeted = req.user ? tweet.retweets.includes(req.user._id) : false;
      
      return {
        _id: tweet._id,
        content: tweet.content,
        user: tweet.user,
        createdAt: tweet.createdAt,
        likeCount: tweet.likes.length,
        retweetCount: tweet.retweets.length,
        replyCount: 0, // We'll calculate this separately
        isLiked,
        isRetweeted
      };
    });
    
    // Get reply counts
    for (let i = 0; i < formattedTweets.length; i++) {
      const replyCount = await Tweet.countDocuments({ replyTo: formattedTweets[i]._id });
      formattedTweets[i].replyCount = replyCount;
    }
    
    res.json(formattedTweets);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
