
const express = require('express');
const Tweet = require('../models/Tweet');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/tweets
 * @desc    Create a new tweet
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
  try {
    const { content, replyTo } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ message: 'Tweet content is required' });
    }
    
    if (content.length > 280) {
      return res.status(400).json({ message: 'Tweet cannot exceed 280 characters' });
    }
    
    const newTweet = new Tweet({
      user: req.user._id,
      content
    });
    
    // If this is a reply
    if (replyTo) {
      const originalTweet = await Tweet.findById(replyTo);
      
      if (!originalTweet) {
        return res.status(404).json({ message: 'Original tweet not found' });
      }
      
      newTweet.replyTo = replyTo;
      
      // Create notification for reply
      if (originalTweet.user.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: originalTweet.user,
          sender: req.user._id,
          type: 'reply',
          tweet: newTweet._id,
          message: `${req.user.name} replied to your chirp`
        });
      }
    }
    
    await newTweet.save();
    
    // Populate user info
    await newTweet.populate('user', 'name username profileImage');
    
    // If this is a reply, populate reply info
    if (replyTo) {
      await newTweet.populate({
        path: 'replyTo',
        populate: {
          path: 'user',
          select: 'name username'
        }
      });
    }
    
    // Format tweet for response
    const formattedTweet = {
      _id: newTweet._id,
      content: newTweet.content,
      user: newTweet.user,
      createdAt: newTweet.createdAt,
      likeCount: 0,
      retweetCount: 0,
      replyCount: 0,
      isLiked: false,
      isRetweeted: false,
      replyTo: newTweet.replyTo
    };
    
    res.status(201).json(formattedTweet);
  } catch (error) {
    console.error('Create tweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/tweets/timeline
 * @desc    Get tweets for user's timeline
 * @access  Private
 */
router.get('/timeline', protect, async (req, res) => {
  try {
    // Get current user's following list
    const user = await User.findById(req.user._id);
    const following = user.following;
    following.push(req.user._id); // Include own tweets
    
    // Get tweets from followed users and self
    const tweets = await Tweet.find({ 
      user: { $in: following },
      replyTo: null // Exclude replies from timeline
    })
    .populate('user', 'name username profileImage')
    .sort({ createdAt: -1 })
    .limit(50);
    
    // Format tweets for response
    const formattedTweets = tweets.map(tweet => {
      const isLiked = tweet.likes.includes(req.user._id);
      const isRetweeted = tweet.retweets.includes(req.user._id);
      
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
    console.error('Get timeline error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/tweets/explore
 * @desc    Get tweets for explore page
 * @access  Public
 */
router.get('/explore', async (req, res) => {
  try {
    // Get popular tweets
    const tweets = await Tweet.find({ replyTo: null })
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
    console.error('Get explore tweets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/tweets/:id
 * @desc    Get a single tweet
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id)
      .populate('user', 'name username profileImage')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'user',
          select: 'name username'
        }
      });
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Format tweet for response
    const isLiked = req.user ? tweet.likes.includes(req.user._id) : false;
    const isRetweeted = req.user ? tweet.retweets.includes(req.user._id) : false;
    const replyCount = await Tweet.countDocuments({ replyTo: tweet._id });
    
    const formattedTweet = {
      _id: tweet._id,
      content: tweet.content,
      user: tweet.user,
      createdAt: tweet.createdAt,
      likeCount: tweet.likes.length,
      retweetCount: tweet.retweets.length,
      replyCount,
      isLiked,
      isRetweeted,
      replyTo: tweet.replyTo
    };
    
    res.json(formattedTweet);
  } catch (error) {
    console.error('Get tweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/tweets/:id/replies
 * @desc    Get replies to a tweet
 * @access  Public
 */
router.get('/:id/replies', async (req, res) => {
  try {
    const replies = await Tweet.find({ replyTo: req.params.id })
      .populate('user', 'name username profileImage')
      .sort({ createdAt: -1 });
    
    // Format replies for response
    const formattedReplies = replies.map(reply => {
      const isLiked = req.user ? reply.likes.includes(req.user._id) : false;
      const isRetweeted = req.user ? reply.retweets.includes(req.user._id) : false;
      
      return {
        _id: reply._id,
        content: reply.content,
        user: reply.user,
        createdAt: reply.createdAt,
        likeCount: reply.likes.length,
        retweetCount: reply.retweets.length,
        replyCount: 0, // We'll calculate this separately
        isLiked,
        isRetweeted,
        replyTo: {
          _id: req.params.id
        }
      };
    });
    
    // Get reply counts
    for (let i = 0; i < formattedReplies.length; i++) {
      const replyCount = await Tweet.countDocuments({ replyTo: formattedReplies[i]._id });
      formattedReplies[i].replyCount = replyCount;
    }
    
    res.json(formattedReplies);
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/tweets/:id/like
 * @desc    Like a tweet
 * @access  Private
 */
router.post('/:id/like', protect, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if already liked
    if (tweet.likes.includes(req.user._id)) {
      return res.status(400).json({ message: 'Tweet already liked' });
    }
    
    // Add like
    tweet.likes.push(req.user._id);
    await tweet.save();
    
    // Create notification if the tweet is not by the current user
    if (tweet.user.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: tweet.user,
        sender: req.user._id,
        type: 'like',
        tweet: tweet._id,
        message: `${req.user.name} liked your chirp`
      });
    }
    
    res.json({ message: 'Tweet liked successfully' });
  } catch (error) {
    console.error('Like tweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/tweets/:id/unlike
 * @desc    Unlike a tweet
 * @access  Private
 */
router.post('/:id/unlike', protect, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if not liked
    if (!tweet.likes.includes(req.user._id)) {
      return res.status(400).json({ message: 'Tweet not liked' });
    }
    
    // Remove like
    tweet.likes = tweet.likes.filter(id => id.toString() !== req.user._id.toString());
    await tweet.save();
    
    res.json({ message: 'Tweet unliked successfully' });
  } catch (error) {
    console.error('Unlike tweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/tweets/:id/retweet
 * @desc    Retweet a tweet
 * @access  Private
 */
router.post('/:id/retweet', protect, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if already retweeted
    if (tweet.retweets.includes(req.user._id)) {
      return res.status(400).json({ message: 'Tweet already retweeted' });
    }
    
    // Add retweet
    tweet.retweets.push(req.user._id);
    await tweet.save();
    
    // Create notification if the tweet is not by the current user
    if (tweet.user.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: tweet.user,
        sender: req.user._id,
        type: 'retweet',
        tweet: tweet._id,
        message: `${req.user.name} retweeted your chirp`
      });
    }
    
    res.json({ message: 'Tweet retweeted successfully' });
  } catch (error) {
    console.error('Retweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/tweets/:id/unretweet
 * @desc    Unretweet a tweet
 * @access  Private
 */
router.post('/:id/unretweet', protect, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if not retweeted
    if (!tweet.retweets.includes(req.user._id)) {
      return res.status(400).json({ message: 'Tweet not retweeted' });
    }
    
    // Remove retweet
    tweet.retweets = tweet.retweets.filter(id => id.toString() !== req.user._id.toString());
    await tweet.save();
    
    res.json({ message: 'Tweet unretweeted successfully' });
  } catch (error) {
    console.error('Unretweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/tweets/:id
 * @desc    Delete a tweet
 * @access  Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if user owns the tweet
    if (tweet.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    // Delete tweet
    await tweet.deleteOne();
    
    // Delete all replies to this tweet
    await Tweet.deleteMany({ replyTo: req.params.id });
    
    // Delete all notifications related to this tweet
    await Notification.deleteMany({ tweet: req.params.id });
    
    res.json({ message: 'Tweet deleted successfully' });
  } catch (error) {
    console.error('Delete tweet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
