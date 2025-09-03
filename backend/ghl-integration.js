// ===== GoHighLevel Social Planner API Integration =====

// GoHighLevel API configuration
const GHL_API_BASE = 'https://services.leadconnectorhq.com';

// Helper function to get GoHighLevel access token for a client
async function getGHLAccessToken(clientId, pool) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT access_token FROM ghl_sub_accounts WHERE client_id = $1 AND is_active = true LIMIT 1',
        [clientId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('No active GoHighLevel sub-account found for this client');
      }
      
      return result.rows[0].access_token;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error getting GHL access token:', error.message);
    throw error;
  }
}

// Get connected social media accounts for a location
async function getConnectedAccounts(locationId, accessToken, axios) {
  try {
    console.log(`🔗 Getting connected accounts for location: ${locationId}`);
    
    const response = await axios.get(
      `${GHL_API_BASE}/social-media-posting/${locationId}/accounts`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Found ${response.data.accounts?.length || 0} connected accounts`);
    return response.data.accounts || [];
  } catch (error) {
    console.error('❌ Error getting connected accounts:', error.response?.data || error.message);
    throw error;
  }
}

// Create a post in GoHighLevel Social Planner
async function createSocialPost(locationId, postData, accessToken, axios) {
  try {
    console.log(`📝 Creating social post for location: ${locationId}`);
    console.log(`📝 Post data:`, {
      accountId: postData.accountId,
      content: postData.content?.substring(0, 100) + '...',
      media: postData.media?.length || 0,
      callToAction: postData.callToAction
    });
    
    const response = await axios.post(
      `${GHL_API_BASE}/social-media-posting/${locationId}/posts`,
      {
        accountId: postData.accountId,
        content: postData.content,
        media: postData.media || [],
        callToAction: postData.callToAction,
        scheduledAt: postData.scheduledAt
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Social post created successfully:`, response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error creating social post:', error.response?.data || error.message);
    throw error;
  }
}

// Generate GBP-optimized content (200-400 characters)
async function generateGBPContent(topic, businessInfo, ai) {
  try {
    console.log(`🤖 Generating GBP content for topic: "${topic}"`);
    
    const prompt = `Create a Google Business Profile post for ${businessInfo.name} about "${topic}".

REQUIREMENTS:
- 200-400 characters maximum
- Local business focus
- Engaging and conversational tone
- Include a clear value proposition
- End with a compelling call-to-action
- Avoid AI-sounding language like "comprehensive," "cutting-edge," "seamless"

BUSINESS CONTEXT:
- Name: ${businessInfo.name}
- Industry: ${businessInfo.industry}
- Location: ${businessInfo.location || 'Local area'}
- Brand Voice: ${businessInfo.brandVoice || 'Professional and friendly'}

TOPIC: ${topic}

Create a natural, engaging post that sounds like it was written by a real person, not AI. Focus on local relevance and community engagement.`;

    const result = await ai.models.generateContent(prompt);
    const content = result.response.text().trim();
    
    // Validate character count
    if (content.length > 400) {
      console.warn(`⚠️ Content too long (${content.length} chars), truncating...`);
      return content.substring(0, 397) + '...';
    }
    
    console.log(`✅ Generated GBP content (${content.length} chars): ${content.substring(0, 100)}...`);
    return content;
  } catch (error) {
    console.error('❌ Error generating GBP content:', error.message);
    throw error;
  }
}

// Generate GBP-optimized image (square format)
async function generateGBPImage(content, businessInfo, openai) {
  try {
    console.log(`🖼️ Generating GBP image for: ${businessInfo.name}`);
    
    const imagePrompt = `Create a photorealistic, professional image for a Google Business Profile post.

STYLE: Professional photography, natural lighting, authentic textures
FORMAT: Square aspect ratio (1:1), high resolution
CONTENT: ${content}
BUSINESS: ${businessInfo.name} - ${businessInfo.industry}

AVOID: Illustrations, artistic renderings, text overlays
FOCUS: Real-world environment, believable objects, professional quality

The image should look like a genuine photograph taken by a professional photographer, representing the business and topic in a photorealistic way.`;

    if (!openai) {
      console.warn('⚠️ OpenAI not initialized - skipping image generation');
      return null;
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "natural"
    });

    const imageUrl = response.data[0].url;
    console.log(`✅ Generated GBP image: ${imageUrl}`);
    return { url: imageUrl };
  } catch (error) {
    console.error('❌ Error generating GBP image:', error.message);
    return null;
  }
}

// API Endpoint: Create GBP Post
function createGBPPostEndpoint(app, pool, ai, openai, axios) {
  app.post('/api/gbp/create-post', async (req, res) => {
    try {
      const { clientId, topic, scheduledAt } = req.body;
      
      if (!clientId || !topic) {
        return res.status(400).json({ error: 'Client ID and topic are required' });
      }

      console.log(`🚀 Starting GBP post creation for client: ${clientId}, topic: "${topic}"`);

      // Get client information
      const client = await pool.connect();
      let businessInfo;
      try {
        const result = await client.query('SELECT * FROM clients WHERE id = $1', [clientId]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Client not found' });
        }
        businessInfo = result.rows[0];
      } finally {
        client.release();
      }

      // Get GoHighLevel access token
      const accessToken = await getGHLAccessToken(clientId, pool);
      
      // Get location ID from sub-accounts
      const subAccountClient = await pool.connect();
      let locationId;
      try {
        const result = await subAccountClient.query(
          'SELECT location_id FROM ghl_sub_accounts WHERE client_id = $1 AND is_active = true LIMIT 1',
          [clientId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'No active GoHighLevel sub-account found' });
        }
        locationId = result.rows[0].location_id;
      } finally {
        subAccountClient.release();
      }

      // Generate content and image in parallel
      const [content, imageResult] = await Promise.all([
        generateGBPContent(topic, businessInfo, ai),
        generateGBPImage(topic, businessInfo, openai)
      ]);

      // Create "more info" landing page URL (simplified for now)
      const moreInfoUrl = `${businessInfo.websiteUrl || 'https://example.com'}/learn-more`;

      // Get connected accounts
      const accounts = await getConnectedAccounts(locationId, accessToken, axios);
      const gbpAccount = accounts.find(account => 
        account.platform === 'google_business' || 
        account.platform === 'google' ||
        account.name?.toLowerCase().includes('google')
      );

      if (!gbpAccount) {
        return res.status(404).json({ error: 'No Google Business Profile account connected' });
      }

      // Create post data
      const postData = {
        accountId: gbpAccount.id,
        content: content,
        media: imageResult ? [imageResult.url] : [],
        callToAction: {
          type: 'LEARN_MORE',
          url: moreInfoUrl
        },
        scheduledAt: scheduledAt || new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      };

      // Create post in GoHighLevel
      const ghlPost = await createSocialPost(locationId, postData, accessToken, axios);

      // Save to database
      const dbClient = await pool.connect();
      try {
        const result = await dbClient.query(
          `INSERT INTO gbp_posts (client_id, content, image_url, more_info_url, cta_text, status, scheduled_at, ghl_post_id, ghl_account_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            clientId,
            content,
            imageResult?.url || null,
            moreInfoUrl,
            'Learn More',
            'scheduled',
            postData.scheduledAt,
            ghlPost.id,
            gbpAccount.id
          ]
        );

        console.log(`✅ GBP post created and saved: ${result.rows[0].id}`);

        res.json({
          success: true,
          post: {
            id: result.rows[0].id,
            content: content,
            imageUrl: imageResult?.url,
            moreInfoUrl: moreInfoUrl,
            scheduledAt: postData.scheduledAt,
            ghlPostId: ghlPost.id,
            status: 'scheduled'
          },
          message: '🎉 GBP post created and scheduled successfully!'
        });

      } finally {
        dbClient.release();
      }

    } catch (error) {
      console.error('❌ GBP post creation error:', error);
      res.status(500).json({ 
        error: 'Failed to create GBP post', 
        details: error.message 
      });
    }
  });
}

// API Endpoint: Get GBP Posts for a client
function getGBPPostsEndpoint(app, pool) {
  app.get('/api/gbp/posts/:clientId', async (req, res) => {
    try {
      const { clientId } = req.params;
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM gbp_posts WHERE client_id = $1 ORDER BY created_at DESC',
          [clientId]
        );
        
        res.json({
          success: true,
          posts: result.rows
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error getting GBP posts:', error);
      res.status(500).json({ 
        error: 'Failed to get GBP posts', 
        details: error.message 
      });
    }
  });
}

// API Endpoint: Manage GoHighLevel Sub-Accounts
function manageGHLSubAccountsEndpoint(app, pool) {
  app.post('/api/ghl/sub-accounts', async (req, res) => {
    try {
      const { clientId, locationId, subAccountName, accessToken } = req.body;
      
      if (!clientId || !locationId || !accessToken) {
        return res.status(400).json({ error: 'Client ID, Location ID, and Access Token are required' });
      }

      const client = await pool.connect();
      try {
        const result = await client.query(
          `INSERT INTO ghl_sub_accounts (client_id, location_id, sub_account_name, access_token, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (client_id, location_id) 
           DO UPDATE SET 
             sub_account_name = EXCLUDED.sub_account_name,
             access_token = EXCLUDED.access_token,
             is_active = true,
             created_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [clientId, locationId, subAccountName, accessToken]
        );

        console.log(`✅ GHL sub-account saved: ${result.rows[0].id}`);

        res.json({
          success: true,
          subAccount: result.rows[0],
          message: '🎉 GoHighLevel sub-account configured successfully!'
        });

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error saving GHL sub-account:', error);
      res.status(500).json({ 
        error: 'Failed to save sub-account', 
        details: error.message 
      });
    }
  });
}

// API Endpoint: Get GoHighLevel Sub-Accounts for a client
function getGHLSubAccountsEndpoint(app, pool) {
  app.get('/api/ghl/sub-accounts/:clientId', async (req, res) => {
    try {
      const { clientId } = req.params;
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM ghl_sub_accounts WHERE client_id = $1 ORDER BY created_at DESC',
          [clientId]
        );
        
        res.json({
          success: true,
          subAccounts: result.rows
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error getting GHL sub-accounts:', error);
      res.status(500).json({ 
        error: 'Failed to get sub-accounts', 
        details: error.message 
      });
    }
  });
}

// Test GoHighLevel connection endpoint
export function testGHLConnectionEndpoint(app, pool) {
  app.post('/api/ghl/test-connection', async (req, res) => {
    const { clientId, locationId } = req.body;
    
    if (!clientId || !locationId) {
      return res.status(400).json({ 
        success: false,
        error: 'Client ID and Location ID are required' 
      });
    }
    
    try {
      // Get client info
      const client = await pool.connect();
      try {
        const clientResult = await client.query('SELECT * FROM clients WHERE id = $1', [clientId]);
        if (clientResult.rows.length === 0) {
          return res.status(404).json({ 
            success: false,
            error: 'Client not found' 
          });
        }
        
        const clientData = clientResult.rows[0];
        
        // For now, just return success with the location ID
        // In a real implementation, you would test the actual GHL API connection
        res.json({
          success: true,
          location: {
            id: locationId,
            name: `${clientData.name} - Location ${locationId}`
          },
          connectedAccounts: [],
          message: 'GoHighLevel connection test successful (mock response)'
        });
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ GHL connection test failed:', error.message);
      res.status(500).json({ 
        success: false,
        error: 'Connection test failed',
        details: error.message 
      });
    }
  });
}

// Export all functions
export {
  getGHLAccessToken,
  getConnectedAccounts,
  createSocialPost,
  generateGBPContent,
  generateGBPImage,
  createGBPPostEndpoint,
  getGBPPostsEndpoint,
  manageGHLSubAccountsEndpoint,
  getGHLSubAccountsEndpoint,
  testGHLConnectionEndpoint
};
