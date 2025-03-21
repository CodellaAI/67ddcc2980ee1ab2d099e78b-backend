
const express = require('express');
const User = require('../models/User');
const Tweet = require('../models/Tweet');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/users/:username
 * @desc    Get user profile by username
 * @access  Public
 */
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Count tweets
    const tweetsCount = await Tweet.countDocuments({ user: user._id });
    
    // Format user data
    const userData = {
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      bio: user.bio,
      location: user.location,
      website: user.website,
      profileImage: user.profileImage,
      followers: user.followers.length,
      following: user.following.length,
      createdAt: user.createdAt,
      tweetsCount
    };
    
    // Check if the requesting user is following this user
    if (req.user) {
      userData.isFollowing = user.followers.includes(req.user._id);
    }
    
    res.json(userData);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/users/:username/tweets
 * @desc    Get tweets by a user
 * @access  Public
 */
router.get('/:username/tweets', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's tweets
    const tweets = await Tweet.find({ 
      $or: [
        { user: user._id },
        { retweetData: { $ne: null }, user: user._id }
      ]
    })
    .populate('user', 'name username profileImage')
    .populate('replyTo', 'user')
    .populate({
      path: 'replyTo',
      populate: {
        path: 'user',
        select: 'name username'
      }
    })
    .sort({ createdAt: -1 });
    
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
        isRetweeted,
        replyTo: tweet.replyTo
      };
    });
    
    // Get reply counts
    for (let i = 0; i < formattedTweets.length; i++) {
      const replyCount = await Tweet.countDocuments({ replyTo: formattedTweets[i]._id });
      formattedTweets[i].replyCount = replyCount;
    }
    
    res.json(formattedTweets);
  } catch (error) {
    console.error('Get user tweets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, bio, location, website, profileImage } = req.body;
    
    // Find user
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update fields
    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;
    if (website !== undefined) user.website = website;
    if (profileImage !== undefined) user.profileImage = profileImage;
    
    // Save user
    await user.save();
    
    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      bio: user.bio,
      location: user.location,
      website: user.website,
      profileImage: user.profileImage
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/users/:id/follow
 * @desc    Follow a user
 * @access  Private
 */
router.post('/:id/follow', protect, async (req, res) => {
  try {
    // Check if user exists
    const userToFollow = await User.findById(req.params.id);
    
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if already following
    if (userToFollow.followers.includes(req.user._id)) {
      return res.status(400).json({ message: 'Already following this user' });
    }
    
    // Check if trying to follow self
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }
    
    // Add to followers and following
    userToFollow.followers.push(req.user._id);
    await userToFollow.save();
    
    const currentUser = await User.findById(req.user._id);
    currentUser.following.push(userToFollow._id);
    await currentUser.save();
    
    // Create notification
    await Notification.create({
      recipient: userToFollow._id,
      sender: req.user._id,
      type: 'follow',
      message: `${req.user.name} started following you`
    });
    
    res.json({ message: 'User followed successfully' });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/users/:id/unfollow
 * @desc    Unfollow a user
 * @access  Private
 */
router.post('/:id/unfollow', protect, async (req, res) => {
  try {
    // Check if user exists
    const userToUnfollow = await User.findById(req.params.id);
    
    if (!userToUnfollow) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if not following
    if (!userToUnfollow.followers.includes(req.user._id)) {
      return res.status(400).json({ message: 'You are not following this user' });
    }
    
    // Remove from followers and following
    userToUnfollow.followers = userToUnfollow.followers.filter(
      id => id.toString() !== req.user._id.toString()
    );
    await userToUnfollow.save();
    
    const currentUser = await User.findById(req.user._id);
    currentUser.following = currentUser.following.filter(
      id => id.toString() !== userToUnfollow._id.toString()
    );
    await currentUser.save();
    
    res.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/users/suggestions
 * @desc    Get user suggestions to follow
 * @access  Private
 */
router.get('/suggestions', protect, async (req, res) => {
  try {
    // Get users not followed by current user
    const currentUser = await User.findById(req.user._id);
    
    // Find users that the current user is not following and is not the current user
    const suggestions = await User.find({
      _id: { $nin: [...currentUser.following, currentUser._id] }
    })
    .select('name username profileImage')
    .limit(5);
    
    res.json(suggestions);
  } catch (error) {
    console.error('Get user suggestions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
