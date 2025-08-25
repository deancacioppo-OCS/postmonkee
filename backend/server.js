import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 3001;

// --- Database Configuration ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeDb() {
  const client = await pool.connect();
  try {
    // Create clients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        industry TEXT NOT NULL,
        "websiteUrl" TEXT,
        "uniqueValueProp" TEXT,
        "brandVoice" TEXT,
        "contentStrategy" TEXT,
        wp JSONB,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
     // Create sitemap_urls table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sitemap_urls (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        url TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
    `);
    // Create used_topics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS used_topics (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
    `);
    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  } finally {
    client.release();
  }
}


// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://blog-monkee-frontend.onrender.com',
        // Allow any Netlify domain
        /https:\/\/.*\.netlify\.app$/,
        // Allow any Netlify custom domain
        /https:\/\/.*\.netlify\.com$/
      ]
    : ['http://localhost:5173', 'http://localhost:3000']
}));
app.use(express.json());

// Initialize Gemini AI
if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- API Routes ---

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Blog MONKEE Backend is running' });
});

// GET all clients
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET a single client
app.get('/api/clients/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).send('Client not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// CREATE a new client
app.post('/api/clients', async (req, res) => {
  const { name, industry, websiteUrl, uniqueValueProp, brandVoice, contentStrategy, wp } = req.body;
  const newClient = {
    id: crypto.randomUUID(),
    name, industry, websiteUrl, uniqueValueProp, brandVoice, contentStrategy, wp
  };
  try {
    const result = await pool.query(
      `INSERT INTO clients (id, name, industry, "websiteUrl", "uniqueValueProp", "brandVoice", "contentStrategy", wp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [newClient.id, newClient.name, newClient.industry, newClient.websiteUrl, newClient.uniqueValueProp, newClient.brandVoice, newClient.contentStrategy, newClient.wp]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// UPDATE a client
app.put('/api/clients/:id', async (req, res) => {
    const { name, industry, websiteUrl, uniqueValueProp, brandVoice, contentStrategy, wp } = req.body;
    try {
        const result = await pool.query(
            `UPDATE clients SET 
             name = $1, industry = $2, "websiteUrl" = $3, "uniqueValueProp" = $4, 
             "brandVoice" = $5, "contentStrategy" = $6, wp = $7, "updatedAt" = NOW()
             WHERE id = $8 RETURNING *`,
            [name, industry, websiteUrl, uniqueValueProp, brandVoice, contentStrategy, wp, req.params.id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).send('Client not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// DELETE a client
app.delete('/api/clients/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
        if (result.rowCount > 0) {
            res.status(204).send();
        } else {
            res.status(404).send('Client not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});


// --- Gemini Generation Routes ---

// 1. Topic Discovery
app.post('/api/generate/topic', async (req, res) => {
    const { clientId } = req.body;
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    try {
        const prompt = `Using Google Search, find one current and highly relevant trending topic, news story, or popular question related to the '${client.industry}' industry. Provide only the topic name or headline. Do not add any extra formatting or quotation marks.`;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });
        
        const topic = response.text.trim();
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        res.json({ topic, sources });

    } catch (error) {
        console.error('Error generating topic:', error);
        res.status(500).json({ error: 'Failed to generate topic from Gemini API' });
    }
});

// 2. Content Planning
app.post('/api/generate/plan', async (req, res) => {
    const { clientId, topic } = req.body;
    
    if(!topic) {
        return res.status(400).json({ error: 'Topic is required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    try {
        const prompt = `
            You are an expert content strategist for a company in the '${client.industry}' industry.
            Company's unique value proposition: '${client.uniqueValueProp}'
            Company's brand voice: '${client.brandVoice}'
            Company's content strategy: '${client.contentStrategy}'
            We want to write a blog post about the following topic: '${topic}'

            Please generate a compelling, SEO-friendly blog post title, a unique angle for the article, and a list of 5-7 relevant SEO keywords.
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: 'The SEO-friendly blog post title.' },
                        angle: { type: Type.STRING, description: 'The unique angle for the article.' },
                        keywords: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: 'A list of 5-7 relevant SEO keywords.'
                        }
                    },
                    required: ["title", "angle", "keywords"]
                },
            },
        });
        
        const plan = JSON.parse(response.text);
        res.json(plan);

    } catch (error) {
        console.error('Error generating plan:', error);
        res.status(500).json({ error: 'Failed to generate plan from Gemini API' });
    }
});

// 3. Outline Generation
app.post('/api/generate/outline', async (req, res) => {
    const { clientId, topic, title, angle, keywords } = req.body;
    
    if(!topic || !title || !angle || !keywords) {
        return res.status(400).json({ error: 'Topic, title, angle, and keywords are required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    try {
        const prompt = `
            You are an expert content writer for a company in the '${client.industry}' industry.
            Company's unique value proposition: '${client.uniqueValueProp}'
            Company's brand voice: '${client.brandVoice}'
            Company's content strategy: '${client.contentStrategy}'
            
            Create a detailed blog post outline for:
            Topic: ${topic}
            Title: ${title}
            Angle: ${angle}
            Target Keywords: ${keywords.join(', ')}
            
            Create a comprehensive outline with main headings, subheadings, and key points to cover.
            Include an introduction, main sections, and conclusion.
            Ensure the outline is SEO-optimized and follows best practices for blog content.
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        outline: { type: Type.STRING, description: 'Detailed blog post outline with headings and key points.' },
                        estimatedWordCount: { type: Type.NUMBER, description: 'Estimated word count for the full article.' },
                        seoScore: { type: Type.NUMBER, description: 'SEO optimization score out of 100.' }
                    },
                    required: ["outline", "estimatedWordCount", "seoScore"]
                },
            },
        });
        
        const outlineData = JSON.parse(response.text);
        res.json(outlineData);

    } catch (error) {
        console.error('Error generating outline:', error);
        res.status(500).json({ error: 'Failed to generate outline from Gemini API' });
    }
});

// 4. Content Generation
app.post('/api/generate/content', async (req, res) => {
    const { clientId, topic, title, angle, keywords, outline } = req.body;
    
    if(!topic || !title || !outline) {
        return res.status(400).json({ error: 'Topic, title, and outline are required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    try {
        const prompt = `
            You are an expert content writer for a company in the '${client.industry}' industry.
            Company's unique value proposition: '${client.uniqueValueProp}'
            Company's brand voice: '${client.brandVoice}'
            Company's content strategy: '${client.contentStrategy}'
            
            Write a complete blog post based on:
            Topic: ${topic}
            Title: ${title}
            Angle: ${angle}
            Target Keywords: ${keywords.join(', ')}
            Outline: ${outline}
            
            Requirements:
            - Write in HTML format with proper headings (h1, h2, h3)
            - Include the target keywords naturally throughout
            - Write in the company's brand voice
            - Make it engaging and valuable for readers
            - Include a compelling introduction and strong conclusion
            - Aim for 1500-2500 words
            - Add internal linking suggestions as comments
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        content: { type: Type.STRING, description: 'Complete blog post content in HTML format.' },
                        wordCount: { type: Type.NUMBER, description: 'Actual word count of the content.' },
                        metaDescription: { type: Type.STRING, description: 'SEO meta description (150-160 characters).' },
                        faq: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    answer: { type: Type.STRING }
                                }
                            },
                            description: 'FAQ section with 3-5 relevant questions and answers.'
                        }
                    },
                    required: ["content", "wordCount", "metaDescription", "faq"]
                },
            },
        });
        
        const contentData = JSON.parse(response.text);
        res.json(contentData);

    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({ error: 'Failed to generate content from Gemini API' });
    }
});

// 5. Image Generation
app.post('/api/generate/images', async (req, res) => {
    const { clientId, title, headings } = req.body;
    
    if(!title) {
        return res.status(400).json({ error: 'Title is required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    try {
        // Generate featured image
        const featuredImageResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Create a professional, modern featured image for a blog post titled "${title}" in the ${client.industry} industry. The image should be visually appealing, relevant to the topic, and suitable for use as a blog header.`,
            config: {
                tools: [{
                    codeExecution: {}
                }]
            }
        });

        // Generate in-body images for key headings
        const inBodyImages = [];
        if (headings && headings.length > 0) {
            for (const heading of headings.slice(0, 3)) { // Limit to first 3 headings
                const imageResponse = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: `Create a relevant illustration or diagram for the section "${heading}" in a blog post about "${title}" in the ${client.industry} industry.`,
                    config: {
                        tools: [{
                            codeExecution: {}
                        }]
                    }
                });
                
                inBodyImages.push({
                    heading: heading,
                    description: `Illustration for ${heading}`,
                    placeholder: `[Image: ${heading}]`
                });
            }
        }

        res.json({
            featuredImage: {
                description: `Featured image for ${title}`,
                placeholder: `[Featured Image: ${title}]`
            },
            inBodyImages: inBodyImages
        });

    } catch (error) {
        console.error('Error generating images:', error);
        res.status(500).json({ error: 'Failed to generate images from Gemini API' });
    }
});

// 6. WordPress Publishing
app.post('/api/publish/wordpress', async (req, res) => {
    const { clientId, title, content, metaDescription, featuredImage, tags, categories } = req.body;
    
    if(!clientId || !title || !content) {
        return res.status(400).json({ error: 'Client ID, title, and content are required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    // Check if WordPress credentials are configured
    if (!client.wp || !client.wp.url || !client.wp.username || !client.wp.appPassword) {
        console.log('WordPress credentials check failed:', {
            hasWp: !!client.wp,
            hasUrl: !!client.wp?.url,
            hasUsername: !!client.wp?.username,
            hasAppPassword: !!client.wp?.appPassword
        });
        return res.status(400).json({ 
            error: 'WordPress credentials not configured for this client',
            details: 'Please ensure WordPress URL, username, and app password are set in client settings'
        });
    }

    try {
        // Prepare WordPress API URL
        const wpApiUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
        console.log('WordPress API URL:', wpApiUrl);
        
        // Prepare post data
        const postData = {
            title: title,
            content: content,
            excerpt: metaDescription || '',
            status: 'draft', // Start as draft for review
            tags: tags || [],
            categories: categories || []
        };
        console.log('WordPress post data prepared:', { title, contentLength: content.length, status: postData.status });

        // Create WordPress post using REST API
        const wpResponse = await fetch(wpApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
            },
            body: JSON.stringify(postData)
        });

        console.log('WordPress API response status:', wpResponse.status);

        if (!wpResponse.ok) {
            const errorText = await wpResponse.text();
            console.error('WordPress API Error Details:', {
                status: wpResponse.status,
                statusText: wpResponse.statusText,
                errorText: errorText,
                url: wpApiUrl,
                username: client.wp.username
            });
            throw new Error(`WordPress publishing failed: ${wpResponse.status} ${wpResponse.statusText} - ${errorText}`);
        }

        const wpPost = await wpResponse.json();

        // Store the published topic to avoid duplicates
        try {
            await pool.query(
                'INSERT INTO used_topics (client_id, topic) VALUES ($1, $2)',
                [clientId, title]
            );
        } catch (topicError) {
            console.log('Topic already exists or error storing:', topicError.message);
        }

        res.json({
            success: true,
            postId: wpPost.id,
            postUrl: wpPost.link,
            editUrl: wpPost.link ? wpPost.link.replace(/\/$/, '') + '/wp-admin/post.php?post=' + wpPost.id + '&action=edit' : null,
            status: wpPost.status,
            message: 'Blog post successfully created as draft in WordPress'
        });

    } catch (error) {
        console.error('Error publishing to WordPress:', error);
        res.status(500).json({ 
            error: 'Failed to publish to WordPress', 
            details: error.message 
        });
    }
});

// WordPress Connection Test
app.post('/api/test/wordpress', async (req, res) => {
    const { clientId } = req.body;
    
    if(!clientId) {
        return res.status(400).json({ error: 'Client ID is required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    // Check if WordPress credentials are configured
    if (!client.wp || !client.wp.url || !client.wp.username || !client.wp.appPassword) {
        return res.status(400).json({ 
            error: 'WordPress credentials not configured',
            credentials: {
                hasUrl: !!client.wp?.url,
                hasUsername: !!client.wp?.username,
                hasAppPassword: !!client.wp?.appPassword
            }
        });
    }

    try {
        // Test WordPress REST API connection
        const wpApiUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/users/me`;
        console.log('Testing WordPress connection to:', wpApiUrl);
        
        const wpResponse = await fetch(wpApiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
            }
        });

        if (!wpResponse.ok) {
            const errorText = await wpResponse.text();
            console.error('WordPress connection test failed:', errorText);
            return res.status(400).json({ 
                error: 'WordPress connection failed',
                status: wpResponse.status,
                details: errorText,
                suggestions: [
                    'Check if WordPress URL is correct and accessible',
                    'Verify username and app password are correct',
                    'Ensure WordPress REST API is enabled',
                    'Check if site has security plugins blocking API access'
                ]
            });
        }

        const userData = await wpResponse.json();
        
        res.json({
            success: true,
            message: 'WordPress connection successful',
            user: {
                id: userData.id,
                name: userData.name,
                username: userData.username,
                capabilities: userData.capabilities
            },
            siteUrl: client.wp.url
        });

    } catch (error) {
        console.error('Error testing WordPress connection:', error);
        res.status(500).json({ 
            error: 'Failed to test WordPress connection', 
            details: error.message 
        });
    }
});

// 7. Complete Blog Generation (All-in-One)
app.post('/api/generate/complete-blog', async (req, res) => {
    const { clientId } = req.body;
    
    if(!clientId) {
        return res.status(400).json({ error: 'Client ID is required' });
    }
    
    let client;
    try {
       const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
       if (result.rows.length === 0) {
           return res.status(404).json({ error: 'Client not found' });
       }
       client = result.rows[0];
    } catch(dbError) {
        console.error('DB Error fetching client:', dbError);
        return res.status(500).json({ error: 'Database error' });
    }

    try {
        // Step 1: Generate Topic
        const topicPrompt = `Using Google Search, find one current and highly relevant trending topic, news story, or popular question related to the '${client.industry}' industry. Provide only the topic name or headline. Do not add any extra formatting or quotation marks.`;
        
        const topicResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: topicPrompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });
        
        const topic = topicResponse.text.trim();
        const sources = topicResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        // Step 2: Generate Plan
        const planPrompt = `
            You are an expert content strategist for a company in the '${client.industry}' industry.
            Company's unique value proposition: '${client.uniqueValueProp}'
            Company's brand voice: '${client.brandVoice}'
            Company's content strategy: '${client.contentStrategy}'
            We want to write a blog post about the following topic: '${topic}'

            Please generate a compelling, SEO-friendly blog post title, a unique angle for the article, and a list of 5-7 relevant SEO keywords.
        `;
        
        const planResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: planPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: 'The SEO-friendly blog post title.' },
                        angle: { type: Type.STRING, description: 'The unique angle for the article.' },
                        keywords: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: 'A list of 5-7 relevant SEO keywords.'
                        }
                    },
                    required: ["title", "angle", "keywords"]
                },
            },
        });
        
        const plan = JSON.parse(planResponse.text);

        // Step 3: Generate Complete Blog Post
        const contentPrompt = `
            You are an expert content writer for a company in the '${client.industry}' industry.
            Company's unique value proposition: '${client.uniqueValueProp}'
            Company's brand voice: '${client.brandVoice}'
            Company's content strategy: '${client.contentStrategy}'
            
            Write a complete blog post based on:
            Topic: ${topic}
            Title: ${plan.title}
            Angle: ${plan.angle}
            Target Keywords: ${plan.keywords.join(', ')}
            
            Requirements:
            - Write in HTML format with proper headings (h1, h2, h3)
            - Include the target keywords naturally throughout
            - Write in the company's brand voice
            - Make it engaging and valuable for readers
            - Include a compelling introduction and strong conclusion
            - Aim for 1500-2500 words
            - Add internal linking suggestions as comments
        `;
        
        const contentResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contentPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        content: { type: Type.STRING, description: 'Complete blog post content in HTML format.' },
                        wordCount: { type: Type.NUMBER, description: 'Actual word count of the content.' },
                        metaDescription: { type: Type.STRING, description: 'SEO meta description (150-160 characters).' },
                        faq: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    answer: { type: Type.STRING }
                                }
                            },
                            description: 'FAQ section with 3-5 relevant questions and answers.'
                        }
                    },
                    required: ["content", "wordCount", "metaDescription", "faq"]
                },
            },
        });
        
        const contentData = JSON.parse(contentResponse.text);

        // Return complete blog post data
        res.json({
            topic: topic,
            sources: sources,
            plan: plan,
            content: contentData,
            readyToPublish: true
        });

    } catch (error) {
        console.error('Error generating complete blog:', error);
        res.status(500).json({ error: 'Failed to generate complete blog post' });
    }
});


// Start server
app.listen(port, () => {
  console.log(`Blog MONKEE backend listening at http://localhost:${port}`);
  initializeDb();
});