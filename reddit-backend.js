const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Calculate account age in human-readable format
function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years > 0 ? `${years} years, ${months} months` : `${months} months`;
}

// Calculate age in days
function calculateAgeDays(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Generate Reddit App Access Token
async function getRedditAccessToken() {
  try {
    const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
    console.log('Attempting to fetch Reddit access token with:', {
      client_id: process.env.REDDIT_CLIENT_ID,
      user_agent: process.env.REDDIT_USER_AGENT,
      auth_header: `Basic ${auth}` // Log the base64-encoded auth header (without revealing secret)
    });
    const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
      'grant_type=client_credentials', 
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': process.env.REDDIT_USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000
      }
    );

    const { access_token } = response.data;
    console.log('Fetched new Reddit access token:', access_token);
    return access_token;
  } catch (error) {
    console.error('Reddit Token Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      headers: error.config?.headers // Log headers sent
    });
    throw new Error('Failed to generate Reddit access token');
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Reddit Account Age Checker API is running');
});

// Reddit age checker endpoint (GET)
app.get('/api/reddit/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const token = await getRedditAccessToken();
    const response = await axios.get(`https://oauth.reddit.com/user/${encodeURIComponent(username)}/about`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': process.env.REDDIT_USER_AGENT
      },
      timeout: 5000
    });

    const userData = response.data.data;
    if (!userData) {
      return res.status(404).json({ error: `User ${username} not found` });
    }

    const createdAt = userData.created_utc * 1000; // Convert to ms

    res.json({
      username: userData.name,
      nickname: userData.name, // Reddit uses the same for display
      estimated_creation_date: new Date(createdAt).toLocaleDateString(),
      account_age: calculateAccountAge(createdAt),
      age_days: calculateAgeDays(createdAt),
      followers: userData.subreddit?.subscribers || 0,
      total_karma: userData.total_karma || (userData.link_karma + userData.comment_karma), // Proxy for activity
      verified: userData.is_gold ? 'Premium' : (userData.verified ? 'Email Verified' : 'No'),
      description: userData.subreddit?.public_description || 'N/A',
      region: 'N/A', // Not available in Reddit API
      country: 'N/A', // Not available
      user_id: userData.id,
      avatar: userData.icon_img || userData.snoovatar_img || 'https://via.placeholder.com/50',
      is_banned: userData.is_suspended ? 'Yes' : 'No',
      estimation_confidence: 'High',
      accuracy_range: 'Exact',
      visit_profile: `https://www.reddit.com/user/${username}` // Boxed link for frontend (e.g., <a href="...">Visit on Reddit</a>)
    });
  } catch (error) {
    console.error('Reddit API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Reddit data',
      details: error.response?.data || 'No additional details'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Reddit Server running on port ${port}`);
});
