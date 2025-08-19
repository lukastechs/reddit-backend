const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Rate Limiting (max 60 requests per minute per IP) ---
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// --- Token Caching ---
let cachedToken = null;
let tokenExpiry = 0;

async function getRedditAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  try {
    const auth = Buffer.from(
      `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
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

    cachedToken = response.data.access_token;
    tokenExpiry = now + (response.data.expires_in * 1000) - 10000; // subtract 10s buffer
    return cachedToken;
  } catch (error) {
    console.error('Reddit Token Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error('Failed to generate Reddit access token');
  }
}

// --- Helpers ---
function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years > 0 ? `${years} years, ${months} months` : `${months} months`;
}

function calculateAgeDays(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// --- Endpoints ---
app.get('/', (req, res) => {
  res.send('Reddit Account Age Checker API is running');
});

app.get('/api/reddit/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const token = await getRedditAccessToken();
    const response = await axios.get(
      `https://oauth.reddit.com/user/${encodeURIComponent(username)}/about`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': process.env.REDDIT_USER_AGENT
        },
        timeout: 5000
      }
    );

    const userData = response.data.data;
    if (!userData) {
      return res.status(404).json({ error: `User ${username} not found` });
    }

    const createdAt = userData.created_utc * 1000;

    res.json({
      username: userData.name,
      nickname: userData.name,
      estimated_creation_date: new Date(createdAt).toLocaleDateString(),
      account_age: calculateAccountAge(createdAt),
      age_days: calculateAgeDays(createdAt),
      followers: userData.subreddit?.subscribers || 0,
      total_karma: userData.total_karma || (userData.link_karma + userData.comment_karma),
      verified: userData.is_gold ? 'Premium' : (userData.verified ? 'Email Verified' : 'No'),
      description: userData.subreddit?.public_description || 'N/A',
      region: 'N/A',
      country: 'N/A',
      user_id: userData.id,
      avatar: userData.icon_img || userData.snoovatar_img || 'https://via.placeholder.com/50',
      is_banned: userData.is_suspended ? 'Yes' : 'No',
      estimation_confidence: 'High',
      accuracy_range: 'Exact',
      visit_profile: `https://www.reddit.com/user/${username}`
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

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Reddit Server running on port ${port}`);
});
