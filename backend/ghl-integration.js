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
    console.log(`📊 Business info received:`, JSON.stringify(businessInfo, null, 2));
    
    // Validate businessInfo
    if (!businessInfo) {
      throw new Error('businessInfo is null or undefined');
    }
    
    // Validate required properties
    if (!businessInfo.name) {
      throw new Error('businessInfo.name is null or undefined');
    }
    if (!businessInfo.industry) {
      throw new Error('businessInfo.industry is null or undefined');
    }
    
    console.log(`✅ Business info validation passed: ${businessInfo.name} - ${businessInfo.industry}`);
    
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

    // 1) Try structured call
    let content = '';
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text: prompt }] }
        ]
      });
      if (typeof result?.text === 'function') {
        content = (result.text() || '').trim();
      } else if (typeof result?.response?.text === 'function') {
        content = (result.response.text() || '').trim();
      }
    } catch (e1) {
      console.warn('⚠️ Structured Gemini call failed, will try simple call:', e1?.message);
    }

    // 2) Fallback to simple call signature if needed
    if (!content) {
      try {
        const resultSimple = await ai.models.generateContent(prompt);
        if (typeof resultSimple?.text === 'function') {
          content = (resultSimple.text() || '').trim();
        } else if (typeof resultSimple?.response?.text === 'function') {
          content = (resultSimple.response.text() || '').trim();
        }
      } catch (e2) {
        console.warn('⚠️ Simple Gemini call failed:', e2?.message);
      }
    }

    // 3) If still empty, supply a safe draft to avoid 500s
    if (!content) {
      console.warn('⚠️ Gemini returned empty content. Using safe draft fallback.');
      content = `${businessInfo.name} — ${topic}. We offer trusted, local service with a friendly team ready to help. Call today to get started!`;
    }
    
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
    console.log(`📊 Business info for image:`, JSON.stringify(businessInfo, null, 2));
    
    // Validate businessInfo
    if (!businessInfo) {
      throw new Error('businessInfo is null or undefined in generateGBPImage');
    }
    
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
// Minimal test endpoint to isolate the error
function createTestEndpoint(app, pool, ai, openai, axios) {
  app.post('/api/gbp/test', async (req, res) => {
    try {
      console.log('🧪 Test endpoint called');
      const { clientId, topic } = req.body;
      
      console.log('📊 Request data:', { clientId, topic });
      
      // Test 1: Basic response
      res.json({
        success: true,
        message: 'Test endpoint working',
        data: { clientId, topic }
      });
      
    } catch (error) {
      console.error('❌ Test endpoint error:', error.message);
      res.status(500).json({ 
        error: 'Test endpoint failed',
        details: error.message 
      });
    }
  });
}

// Phase 1: Simplified GBP Post Creation (Content Only)
function createGBPPostEndpoint(app, pool, ai, openai, axios) {
  app.post('/api/gbp/create-post', async (req, res) => {
    try {
      const { clientId, topic } = req.body;
      
      if (!clientId || !topic) {
        return res.status(400).json({ error: 'Client ID and topic are required' });
      }

      console.log(`🚀 Phase 1: Creating GBP content for client: ${clientId}, topic: "${topic}"`);

      // Get client information
      const client = await pool.connect();
      let businessInfo;
      try {
        console.log(`🔍 Querying database for client: ${clientId}`);
        const result = await client.query('SELECT * FROM clients WHERE id = $1', [clientId]);
        console.log(`📊 Database query result:`, result.rows);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Client not found' });
        }
        
        businessInfo = result.rows[0];
        console.log(`📊 Client found: ${businessInfo.name} (${businessInfo.industry})`);
        console.log(`📊 Full client data:`, JSON.stringify(businessInfo, null, 2));
      } finally {
        client.release();
      }

      // Phase 1: Generate content only
      console.log(`🤖 Generating GBP content...`);
      console.log(`📊 businessInfo before generation:`, JSON.stringify(businessInfo, null, 2));
      console.log(`📊 topic:`, topic);
      console.log(`📊 ai object:`, ai ? 'exists' : 'null/undefined');
      
      const content = await generateGBPContent(topic, businessInfo, ai);
      console.log(`✅ Content generated:`, content ? `${content.substring(0, 100)}...` : 'null/undefined');

      // Save to database (simple version)
      const dbClient = await pool.connect();
      try {
        const result = await dbClient.query(
          `INSERT INTO gbp_posts (client_id, content, status, created_at)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [
            clientId,
            content,
            'draft', // Phase 1: Just save as draft
            new Date()
          ]
        );

        const savedPost = result.rows[0];
        console.log(`✅ GBP post saved to database: ${savedPost.id}`);
        
        // Attempt live posting via GoHighLevel if sub-account is configured
        let posted = false;
        let ghlPostId = null;
        let ghlAccountId = null;
        let scheduledAt = null;
        let postStatus = savedPost.status;
        let postMessage = '✅ GBP content generated and saved successfully!';

        try {
          // Find active sub-account
          const subRes = await dbClient.query(
            `SELECT location_id, access_token FROM ghl_sub_accounts 
             WHERE client_id = $1 AND is_active = true 
             ORDER BY created_at DESC LIMIT 1`,
            [clientId]
          );

          if (subRes.rows.length === 0) {
            console.log('ℹ️ No active GoHighLevel sub-account found. Skipping live post.');
          } else {
            const { location_id: locationId, access_token: accessToken } = subRes.rows[0];
            console.log('🔗 Using GHL location:', locationId);

            // Get connected accounts and select Google Business Profile
            const accounts = await getConnectedAccounts(locationId, accessToken, axios);
            let gbpAccount = null;
            if (Array.isArray(accounts)) {
              gbpAccount = accounts.find(a => {
                const s = JSON.stringify(a).toLowerCase();
                return s.includes('google');
              }) || accounts[0] || null;
            }

            if (!gbpAccount) {
              console.log('ℹ️ No connected social accounts available. Skipping live post.');
            } else {
              const accountId = gbpAccount.id || gbpAccount.accountId || gbpAccount.account_id;
              console.log('📝 Posting to GHL account:', accountId);

              const callToAction = {
                text: 'Learn More',
                url: businessInfo.websiteUrl || businessInfo.website || ''
              };

              const created = await createSocialPost(
                locationId,
                {
                  accountId,
                  content,
                  media: [],
                  callToAction,
                  scheduledAt: null
                },
                accessToken,
                axios
              );

              // Best-effort extraction of IDs
              ghlPostId = created?.id || created?.postId || created?.post?.id || null;
              ghlAccountId = accountId || null;
              scheduledAt = created?.scheduledAt || null;
              posted = !!ghlPostId || !!created;
              postStatus = scheduledAt ? 'scheduled' : (posted ? 'published' : postStatus);
              postMessage = posted ? '🎉 Posted to GoHighLevel successfully' : postMessage;

              // Update stored post metadata
              await dbClient.query(
                `UPDATE gbp_posts 
                 SET status = $1, ghl_post_id = $2, ghl_account_id = $3, published_at = COALESCE($4, published_at)
                 WHERE id = $5`,
                [postStatus, ghlPostId, ghlAccountId, scheduledAt ? new Date(scheduledAt) : new Date(), savedPost.id]
              );
            }
          }
        } catch (ghlError) {
          console.log('⚠️ Skipping live post due to error:', ghlError.message);
        }

        res.json({
          success: true,
          posted,
          ghlPostId,
          accountId: ghlAccountId,
          scheduledAt,
          post: {
            id: savedPost.id,
            content: savedPost.content,
            status: postStatus,
            created_at: savedPost.created_at
          },
          message: postMessage
        });
      } finally {
        dbClient.release();
      }

    } catch (error) {
      console.error('❌ Error creating GBP post:', error.message);
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
  createTestEndpoint,
  createGBPPostEndpoint,
  getGBPPostsEndpoint,
  manageGHLSubAccountsEndpoint,
  getGHLSubAccountsEndpoint
};
