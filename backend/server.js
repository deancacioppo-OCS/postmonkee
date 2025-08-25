import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import crypto from 'crypto';
import pg from 'pg';
import FormData from 'form-data';

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
        "sitemapUrl" TEXT,
        wp JSONB,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add sitemapUrl column if it doesn't exist (for existing databases)
    try {
      // Check if column exists first
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'sitemapUrl';
      `);
      
      if (columnCheck.rows.length === 0) {
        await client.query(`ALTER TABLE clients ADD COLUMN "sitemapUrl" TEXT;`);
        console.log('✓ sitemapUrl column added');
      } else {
        console.log('✓ sitemapUrl column already exists');
      }
    } catch (alterError) {
      console.log('Note: Could not add sitemapUrl column:', alterError.message);
    }
     // Check if sitemap_urls table exists and get its structure
    const tableCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sitemap_urls' 
      ORDER BY ordinal_position;
    `);
    
    console.log('Current sitemap_urls table structure:', tableCheck.rows);

    // Create enhanced sitemap_urls table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sitemap_urls (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        keywords TEXT,
        category TEXT,
        last_modified TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        UNIQUE(client_id, url)
      );
    `);

    // Add missing columns to existing sitemap_urls table
    const columnsToAdd = [
      { name: 'title', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
      { name: 'keywords', type: 'TEXT' },
      { name: 'category', type: 'TEXT' },
      { name: 'last_modified', type: 'TIMESTAMP WITH TIME ZONE' }
    ];

    for (const column of columnsToAdd) {
      try {
        // Check if column exists
        const columnCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'sitemap_urls' AND column_name = $1;
        `, [column.name]);
        
        if (columnCheck.rows.length === 0) {
          await client.query(`ALTER TABLE sitemap_urls ADD COLUMN ${column.name} ${column.type};`);
          console.log(`✓ Added column '${column.name}' to sitemap_urls table`);
        } else {
          console.log(`✓ Column '${column.name}' already exists in sitemap_urls table`);
        }
      } catch (alterError) {
        console.log(`❌ Could not add column '${column.name}':`, alterError.message);
      }
    }

    // Check if we still have missing columns after migration attempts
    const finalCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sitemap_urls';
    `);
    
    const currentColumns = finalCheck.rows.map(row => row.column_name);
    const requiredColumns = ['id', 'client_id', 'url', 'title', 'description', 'keywords', 'category', 'last_modified', 'createdAt'];
    const missingColumns = requiredColumns.filter(col => !currentColumns.includes(col) && !currentColumns.includes(`"${col}"`));
    
    console.log('Final column check - Current columns:', currentColumns);
    console.log('Final column check - Missing columns:', missingColumns);
    
    // If we're still missing critical columns, recreate the table
    if (missingColumns.length > 0) {
      console.log('⚠️ Critical columns still missing. Recreating sitemap_urls table...');
      
      // Backup existing data if any
      let backupData = [];
      try {
        const backup = await client.query('SELECT client_id, url FROM sitemap_urls');
        backupData = backup.rows;
        console.log(`📦 Backed up ${backupData.length} existing URLs`);
      } catch (backupError) {
        console.log('No existing data to backup');
      }
      
      // Drop and recreate table
      await client.query('DROP TABLE IF EXISTS sitemap_urls CASCADE');
      await client.query(`
        CREATE TABLE sitemap_urls (
          id SERIAL PRIMARY KEY,
          client_id TEXT NOT NULL,
          url TEXT NOT NULL,
          title TEXT,
          description TEXT,
          keywords TEXT,
          category TEXT,
          last_modified TIMESTAMP WITH TIME ZONE,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          UNIQUE(client_id, url)
        );
      `);
      
      // Restore basic data if we had any
      for (const row of backupData) {
        try {
          await client.query(
            'INSERT INTO sitemap_urls (client_id, url, "createdAt") VALUES ($1, $2, NOW())',
            [row.client_id, row.url]
          );
        } catch (restoreError) {
          console.log('Failed to restore row:', restoreError.message);
        }
      }
      
      console.log('✅ Successfully recreated sitemap_urls table with all columns');
    } else {
      console.log('✅ All required columns are present in sitemap_urls table');
    }
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

// --- Helper Functions ---

async function uploadImageToWordPress(imageBase64, filename, altText, client) {
    try {
        // Convert base64 to buffer
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        // Create form data for WordPress media upload
        const form = new FormData();
        form.append('file', imageBuffer, {
            filename: filename,
            contentType: 'image/jpeg' // Assuming JPEG, could be dynamic
        });
        
        // Upload to WordPress media library
        const uploadUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/media`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`,
                ...form.getHeaders()
            },
            body: form
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`WordPress media upload failed: ${uploadResponse.status} - ${errorText}`);
        }
        
        const mediaData = await uploadResponse.json();
        
        // Update ALT text if provided
        if (altText) {
            const updateUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/media/${mediaData.id}`;
            await fetch(updateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
                },
                body: JSON.stringify({
                    alt_text: altText
                })
            });
        }
        
        return {
            id: mediaData.id,
            url: mediaData.source_url,
            altText: altText
        };
        
    } catch (error) {
        console.error('Error uploading image to WordPress:', error);
        throw error;
    }
}

function validateInternalLinks(content, validLinks) {
    if (!validLinks.length) return { valid: true, message: 'No internal links to validate' };
    
    const validUrls = validLinks.map(link => link.url);
    const linkMatches = content.match(/href="([^"]+)"/g) || [];
    const extractedUrls = linkMatches.map(match => match.replace(/href="([^"]+)"/, '$1'));
    
    const invalidUrls = extractedUrls.filter(url => 
        url.startsWith('http') && // Only check external URLs
        !validUrls.includes(url) && 
        !url.includes('mailto:') && // Ignore email links
        !url.includes('tel:') // Ignore phone links
    );
    
    if (invalidUrls.length > 0) {
        console.warn('⚠️ Generated content contains invalid internal URLs:', invalidUrls);
        console.log('Valid URLs were:', validUrls);
        return { 
            valid: false, 
            invalidUrls: invalidUrls,
            validUrls: validUrls,
            message: `Found ${invalidUrls.length} invalid URLs` 
        };
    } else {
        console.log('✅ All internal links in generated content are valid');
        return { valid: true, message: 'All internal links are valid' };
    }
}

// --- Web Crawling Functions ---

async function crawlWebsiteForClient(clientId, websiteUrl) {
    try {
        console.log(`Crawling website for client ${clientId}: ${websiteUrl}`);
        
        // Use Gemini to intelligently crawl the website
        const crawlPrompt = `
            You are a web crawler. I need you to analyze a website and find all internal pages that would be good for internal linking in blog content.
            
            Website: ${websiteUrl}
            
            Instructions:
            1. Start from the homepage
            2. Find and return URLs of internal pages (same domain only)
            3. Focus on: blog posts, service pages, product pages, about pages, resource pages
            4. Skip: images, PDFs, external links, contact forms, login pages
            5. For each URL, provide a title and brief description
            6. Limit to 30 most important pages
            
            Return a JSON array of objects with this structure:
            [
                {
                    "url": "https://example.com/page",
                    "title": "Page Title",
                    "description": "Brief description of what this page is about",
                    "category": "blog|service|product|about|resource|other"
                }
            ]
            
            Be thorough but prioritize pages that would be valuable for internal linking.
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: crawlPrompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        
        const crawledPages = JSON.parse(response.text);
        console.log(`Gemini found ${crawledPages.length} pages to crawl`);
        
        // Store URLs in database
        for (const page of crawledPages) {
            try {
                await pool.query(
                    'INSERT INTO sitemap_urls (client_id, url, title, description, category, last_modified) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (client_id, url) DO UPDATE SET title = $3, description = $4, category = $5, last_modified = NOW()',
                    [clientId, page.url, page.title, page.description, page.category]
                );
            } catch (insertError) {
                console.log(`Failed to insert URL ${page.url}:`, insertError.message);
            }
        }
        
        console.log(`Stored ${crawledPages.length} URLs for client ${clientId}`);
        return crawledPages.length;
        
    } catch (error) {
        console.error('Error crawling website:', error);
        throw error;
    }
}

async function analyzeUrlsWithAI(clientId, urls) {
    try {
        const client = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
        if (client.rows.length === 0) return;
        
        const clientData = client.rows[0];
        
        // Analyze URLs in batches to extract titles and categorize
        const urlList = urls.map(u => u.url).join('\n');
        
        const prompt = `
            Analyze these URLs from a ${clientData.industry} website and extract likely page titles, descriptions, and categories for internal linking purposes:
            
            ${urlList}
            
            For each URL, provide:
            1. Likely page title (infer from URL structure)
            2. Brief description of what the page likely contains
            3. Category/topic (for grouping related content)
            4. Keywords that might be relevant for internal linking
            
            Focus on content that would be valuable for internal linking in blog posts.
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        pages: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    url: { type: Type.STRING },
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    category: { type: Type.STRING },
                                    keywords: { type: Type.STRING }
                                }
                            }
                        }
                    },
                    required: ["pages"]
                }
            }
        });
        
        const analysis = JSON.parse(response.text);
        
        // Update database with AI analysis
        for (const page of analysis.pages) {
            try {
                await pool.query(
                    'UPDATE sitemap_urls SET title = $1, description = $2, category = $3, keywords = $4 WHERE client_id = $5 AND url = $6',
                    [page.title, page.description, page.category, page.keywords, clientId, page.url]
                );
            } catch (updateError) {
                console.log(`Failed to update URL analysis for ${page.url}:`, updateError.message);
            }
        }
        
        console.log(`Analyzed ${analysis.pages.length} URLs with AI`);
    } catch (error) {
        console.error('Error analyzing URLs with AI:', error);
    }
}

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
    
    // Crawl website for internal links if websiteUrl is provided
    if (websiteUrl) {
      try {
        console.log(`Starting website crawl for new client: ${name}`);
        await crawlWebsiteForClient(newClient.id, websiteUrl);
        console.log(`Website crawl completed for client: ${name}`);
      } catch (crawlError) {
        console.log(`Failed to crawl website for client ${name}:`, crawlError.message);
        // Don't fail client creation if crawling fails
      }
    }
    
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
        // Get current client to compare websiteUrl
        const currentClient = await pool.query('SELECT "websiteUrl" FROM clients WHERE id = $1', [req.params.id]);
        const currentWebsiteUrl = currentClient.rows[0]?.websiteUrl;
        
        const result = await pool.query(
            `UPDATE clients SET 
             name = $1, industry = $2, "websiteUrl" = $3, "uniqueValueProp" = $4, 
             "brandVoice" = $5, "contentStrategy" = $6, wp = $7, "updatedAt" = NOW()
             WHERE id = $8 RETURNING *`,
            [name, industry, websiteUrl, uniqueValueProp, brandVoice, contentStrategy, wp, req.params.id]
        );
        
        if (result.rows.length > 0) {
            // If website URL is provided and changed, crawl and store it
            if (websiteUrl && websiteUrl !== currentWebsiteUrl) {
                try {
                    console.log(`Website URL changed for client ${name}, starting crawl...`);
                    // Clear existing URLs for this client
                    await pool.query('DELETE FROM sitemap_urls WHERE client_id = $1', [req.params.id]);
                    // Crawl and store new website
                    await crawlWebsiteForClient(req.params.id, websiteUrl);
                    console.log(`Website crawl completed for client: ${name}`);
                } catch (crawlError) {
                    console.log(`Failed to crawl website for client ${name}:`, crawlError.message);
                }
            }
            
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

    // Get available internal links from sitemap
    let internalLinks = [];
    try {
        const linkResult = await pool.query(
            'SELECT url, title, description, category, keywords FROM sitemap_urls WHERE client_id = $1 AND title IS NOT NULL ORDER BY "createdAt" DESC LIMIT 20',
            [clientId]
        );
        internalLinks = linkResult.rows;
        console.log(`Found ${internalLinks.length} internal links for client ${clientId}`);
        
        // If no analyzed links, try to get any sitemap URLs
        if (internalLinks.length === 0) {
            const allLinksResult = await pool.query(
                'SELECT url FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC LIMIT 10',
                [clientId]
            );
            console.log(`Found ${allLinksResult.rows.length} total sitemap URLs for client ${clientId}`);
            
            // Use basic URLs if no analyzed ones available
            if (allLinksResult.rows.length > 0) {
                internalLinks = allLinksResult.rows.map(row => ({
                    url: row.url,
                    title: `Page: ${row.url.split('/').pop() || 'Home'}`,
                    description: 'Internal page',
                    category: 'general',
                    keywords: 'related content'
                }));
                console.log(`Using ${internalLinks.length} basic internal links`);
            }
        }
    } catch (linkError) {
        console.log('Failed to fetch internal links:', linkError.message);
    }

    try {
        const internalLinksContext = internalLinks.length > 0 
            ? `\nAvailable Internal Links - USE EXACT URLs ONLY:
               ${internalLinks.map(link => `- URL: ${link.url} | Title: "${link.title}" | Category: ${link.category || 'general'} | Keywords: ${link.keywords || 'N/A'}`).join('\n')}
               
               IMPORTANT: You MUST use these exact URLs. Do not modify, create, or guess URLs.`
            : '\nNo internal links available yet - do not create any internal links.';

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
            ${internalLinksContext}
            
            Requirements:
            - Write in HTML format with proper headings (h1, h2, h3)
            - Include the target keywords naturally throughout
            - Write in the company's brand voice
            - Make it engaging and valuable for readers
            - Include a compelling introduction and strong conclusion
            - Aim for 1500-2500 words
            - MUST include 5-8 contextual internal links using ONLY the exact URLs provided above
            - Internal links should flow naturally within sentences
            - Use varied anchor text that matches the content context
            - CRITICAL: Only use the exact URLs listed in the Available Internal Links section
            - DO NOT create or modify URLs - use them exactly as provided
            - Format links as: <a href="EXACT_URL_FROM_LIST">anchor text</a>
            - Minimum 2 internal links, average 5-8 per article
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
        
        // Validate internal links in generated content
        validateInternalLinks(contentData.content, internalLinks);
        
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
        // Generate featured image with Gemini's image generation
        const featuredImageResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate a professional, modern featured image for this blog post titled "${title}" in the ${client.industry} industry. The image should be:
            - Visually appealing and relevant to the topic
            - Professional quality suitable for a blog header
            - Minimum 1400px wide, landscape orientation
            - Very little or no text overlay
            - Clean, modern design
            - Appropriate for ${client.industry} industry
            
            Generate the actual image, not just a description.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        imageBase64: { type: Type.STRING, description: 'Base64 encoded image data' },
                        altText: { type: Type.STRING, description: 'SEO-friendly ALT text for the image' },
                        description: { type: Type.STRING, description: 'Brief description of the image' }
                    },
                    required: ["imageBase64", "altText", "description"]
                }
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

        // Parse featured image response
        const featuredImageData = JSON.parse(featuredImageResponse.text);
        
        res.json({
            featuredImage: {
                imageBase64: featuredImageData.imageBase64,
                altText: featuredImageData.altText,
                description: featuredImageData.description,
                specifications: "1400px+ wide, professional design, minimal text"
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
        
        // Handle tags - convert tag names to IDs or create new tags
        let tagIds = [];
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                try {
                    // First, try to find existing tag
                    const tagSearchUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`;
                    const tagSearchResponse = await fetch(tagSearchUrl, {
                        headers: {
                            'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
                        }
                    });
                    
                    if (tagSearchResponse.ok) {
                        const existingTags = await tagSearchResponse.json();
                        const existingTag = existingTags.find(tag => tag.name.toLowerCase() === tagName.toLowerCase());
                        
                        if (existingTag) {
                            tagIds.push(existingTag.id);
                        } else {
                            // Create new tag
                            const tagCreateUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/tags`;
                            const tagCreateResponse = await fetch(tagCreateUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
                                },
                                body: JSON.stringify({ name: tagName })
                            });
                            
                            if (tagCreateResponse.ok) {
                                const newTag = await tagCreateResponse.json();
                                tagIds.push(newTag.id);
                            }
                        }
                    }
                } catch (tagError) {
                    console.log(`Failed to process tag "${tagName}":`, tagError.message);
                }
            }
        }

        // Prepare post data
        const postData = {
            title: title,
            content: content,
            excerpt: metaDescription || '',
            status: 'draft', // Always start as draft for review
            tags: tagIds // Use tag IDs
        };
        console.log('WordPress post data prepared:', { title, contentLength: content.length, status: postData.status, tagIds });

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

        // Add published blog to internal links database for future linking
        try {
            await pool.query(
                'INSERT INTO sitemap_urls (client_id, url, title, description, category, last_modified) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (client_id, url) DO UPDATE SET title = $3, description = $4, category = $5, last_modified = NOW()',
                [
                    clientId, 
                    wpPost.link,
                    title,
                    metaDescription || 'Generated blog post',
                    'blog'
                ]
            );
            console.log(`Added published blog to internal links database: ${title}`);
        } catch (linkError) {
            console.log('Failed to add published blog to internal links:', linkError.message);
        }

        res.json({
            success: true,
            postId: wpPost.id,
            postUrl: wpPost.link,
            editUrl: wpPost.link ? wpPost.link.replace(/\/$/, '') + '/wp-admin/post.php?post=' + wpPost.id + '&action=edit' : null,
            status: wpPost.status,
            message: 'Blog post successfully created as draft in WordPress for review'
        });

    } catch (error) {
        console.error('Error publishing to WordPress:', error);
        res.status(500).json({ 
            error: 'Failed to publish to WordPress', 
            details: error.message 
        });
    }
});

// Sitemap Management Endpoints
app.post('/api/sitemap/parse', async (req, res) => {
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

    if (!client.sitemapUrl) {
        return res.status(400).json({ error: 'No sitemap URL configured for this client' });
    }

    try {
        const urlCount = await parseSitemapForClient(clientId, client.sitemapUrl);
        res.json({
            success: true,
            message: `Successfully parsed ${urlCount} URLs from sitemap`,
            urlCount: urlCount,
            sitemapUrl: client.sitemapUrl
        });
    } catch (error) {
        console.error('Error parsing sitemap:', error);
        res.status(500).json({ 
            error: 'Failed to parse sitemap', 
            details: error.message 
        });
    }
});

app.get('/api/sitemap/urls/:clientId', async (req, res) => {
    const { clientId } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT url, title, description, category, keywords, last_modified FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC',
            [clientId]
        );
        
        res.json({
            success: true,
            urls: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching sitemap URLs:', error);
        res.status(500).json({ 
            error: 'Failed to fetch sitemap URLs', 
            details: error.message 
        });
    }
});

// Debug: Check internal links for a client
app.get('/api/debug/internal-links/:clientId', async (req, res) => {
    const { clientId } = req.params;
    
    try {
        // Get client info
        const clientResult = await pool.query('SELECT name, "sitemapUrl" FROM clients WHERE id = $1', [clientId]);
        const client = clientResult.rows[0];
        
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        // Get all sitemap URLs
        const allUrlsResult = await pool.query(
            'SELECT url, title, description, category, keywords, "createdAt" FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC',
            [clientId]
        );
        
        // Get analyzed URLs (with titles)
        const analyzedUrlsResult = await pool.query(
            'SELECT url, title, description, category, keywords FROM sitemap_urls WHERE client_id = $1 AND title IS NOT NULL ORDER BY "createdAt" DESC',
            [clientId]
        );
        
        res.json({
            client: {
                name: client.name,
                sitemapUrl: client.sitemapUrl
            },
            stats: {
                totalUrls: allUrlsResult.rows.length,
                analyzedUrls: analyzedUrlsResult.rows.length,
                hasSitemap: !!client.sitemapUrl
            },
            allUrls: allUrlsResult.rows,
            analyzedUrls: analyzedUrlsResult.rows
        });
    } catch (error) {
        console.error('Error debugging internal links:', error);
        res.status(500).json({ 
            error: 'Failed to fetch debug info', 
            details: error.message 
        });
    }
});

// Website Crawling Test
app.post('/api/test/crawl', async (req, res) => {
    const { clientId, websiteUrl } = req.body;
    
    if(!clientId) {
        return res.status(400).json({ error: 'Client ID is required' });
    }
    
    if(!websiteUrl) {
        return res.status(400).json({ error: 'Website URL is required' });
    }
    
    try {
        // Get client info
        const result = await pool.query('SELECT name FROM clients WHERE id = $1', [clientId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const client = result.rows[0];
        
        console.log(`Testing website crawl for client ${client.name}: ${websiteUrl}`);
        
        // Test the crawling function
        const crawledCount = await crawlWebsiteForClient(clientId, websiteUrl);
        
        // Get current URLs in database for this client
        const existingUrls = await pool.query(
            'SELECT url, title, description, category FROM sitemap_urls WHERE client_id = $1 ORDER BY last_modified DESC',
            [clientId]
        );
        
        res.json({
            success: true,
            client: {
                id: clientId,
                name: client.name,
                websiteUrl: websiteUrl
            },
            crawl: {
                totalPagesFound: crawledCount,
                samplePages: existingUrls.rows.slice(0, 5).map(row => ({
                    url: row.url,
                    title: row.title,
                    description: row.description,
                    category: row.category
                }))
            },
            database: {
                existingUrls: existingUrls.rows.length,
                sampleExisting: existingUrls.rows.slice(0, 3)
            },
            message: `Successfully crawled website and found ${crawledCount} pages. Database has ${existingUrls.rows.length} total URLs for this client.`
        });
        
    } catch (error) {
        console.error('Error testing website crawl:', error);
        res.status(500).json({ 
            error: 'Failed to test website crawling', 
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

        // Get internal links for complete blog generation too
        let internalLinks = [];
        try {
            const linkResult = await pool.query(
                'SELECT url, title, description, category, keywords FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC LIMIT 20',
                [clientId]
            );
            internalLinks = linkResult.rows;
            
            // If no analyzed links, use basic URLs
            if (internalLinks.length === 0) {
                const allLinksResult = await pool.query(
                    'SELECT url FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC LIMIT 10',
                    [clientId]
                );
                if (allLinksResult.rows.length > 0) {
                    internalLinks = allLinksResult.rows.map(row => ({
                        url: row.url,
                        title: `Page: ${row.url.split('/').pop() || 'Home'}`,
                        description: 'Internal page',
                        category: 'general',
                        keywords: 'related content'
                    }));
                }
            }
        } catch (linkError) {
            console.log('Failed to fetch internal links for complete blog:', linkError.message);
        }

        const internalLinksContext = internalLinks.length > 0 
            ? `\nAvailable Internal Links - USE EXACT URLs ONLY:
               ${internalLinks.map(link => `- URL: ${link.url} | Title: "${link.title}" | Category: ${link.category || 'general'} | Keywords: ${link.keywords || 'N/A'}`).join('\n')}
               
               IMPORTANT: You MUST use these exact URLs. Do not modify, create, or guess URLs.`
            : '\nNo internal links available yet - do not create any internal links.';

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
            ${internalLinksContext}
            
            Requirements:
            - Write in HTML format with proper headings (h1, h2, h3)
            - Include the target keywords naturally throughout
            - Write in the company's brand voice
            - Make it engaging and valuable for readers
            - Include a compelling introduction and strong conclusion
            - Aim for 1500-2500 words
            - MUST include 5-8 contextual internal links using ONLY the exact URLs provided above
            - Internal links should flow naturally within sentences
            - Use varied anchor text that matches the content context
            - CRITICAL: Only use the exact URLs listed in the Available Internal Links section
            - DO NOT create or modify URLs - use them exactly as provided
            - Format links as: <a href="EXACT_URL_FROM_LIST">anchor text</a>
            - Minimum 2 internal links, average 5-8 per article
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

        // Validate internal links in complete blog content
        validateInternalLinks(contentData.content, internalLinks);

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

// 8. "I'm Feelin' Lucky" - Generate and Auto-Publish Blog
app.post('/api/generate/lucky-blog', async (req, res) => {
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
            error: 'WordPress credentials not configured for this client',
            details: 'Please configure WordPress URL, username, and app password in client settings to use Lucky mode'
        });
    }

    try {
        console.log(`🍀 LUCKY MODE: Generating and auto-publishing blog for ${client.name}`);
        
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

        // Step 3: Get internal links
        let internalLinks = [];
        try {
            const linkResult = await pool.query(
                'SELECT url, title, description, category, keywords FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC LIMIT 20',
                [clientId]
            );
            internalLinks = linkResult.rows;
            
            if (internalLinks.length === 0) {
                const allLinksResult = await pool.query(
                    'SELECT url FROM sitemap_urls WHERE client_id = $1 ORDER BY "createdAt" DESC LIMIT 10',
                    [clientId]
                );
                if (allLinksResult.rows.length > 0) {
                    internalLinks = allLinksResult.rows.map(row => ({
                        url: row.url,
                        title: `Page: ${row.url.split('/').pop() || 'Home'}`,
                        description: 'Internal page',
                        category: 'general',
                        keywords: 'related content'
                    }));
                }
            }
        } catch (linkError) {
            console.log('Failed to fetch internal links for lucky blog:', linkError.message);
        }

        const internalLinksContext = internalLinks.length > 0 
            ? `\nAvailable Internal Links - USE EXACT URLs ONLY:
               ${internalLinks.map(link => `- URL: ${link.url} | Title: "${link.title}" | Category: ${link.category || 'general'} | Keywords: ${link.keywords || 'N/A'}`).join('\n')}
               
               IMPORTANT: You MUST use these exact URLs. Do not modify, create, or guess URLs.`
            : '\nNo internal links available yet - do not create any internal links.';

        // Step 4: Generate Complete Blog Content
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
            ${internalLinksContext}
            
            Requirements:
            - Write in HTML format with proper headings (h1, h2, h3)
            - Include the target keywords naturally throughout
            - Write in the company's brand voice
            - Make it engaging and valuable for readers
            - Include a compelling introduction and strong conclusion
            - Aim for 1500-2500 words
            - MUST include 5-8 contextual internal links using ONLY the exact URLs provided above
            - Internal links should flow naturally within sentences
            - Use varied anchor text that matches the content context
            - CRITICAL: Only use the exact URLs listed in the Available Internal Links section
            - DO NOT create or modify URLs - use them exactly as provided
            - Format links as: <a href="EXACT_URL_FROM_LIST">anchor text</a>
            - Minimum 2 internal links, average 5-8 per article
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
                        metaDescription: { type: Type.STRING, description: 'SEO meta description (150-160 characters).' }
                    },
                    required: ["content", "wordCount", "metaDescription"]
                },
            },
        });
        
        const contentData = JSON.parse(contentResponse.text);

        // Validate internal links in lucky blog content
        validateInternalLinks(contentData.content, internalLinks);

        // Step 5: Generate and Upload Featured Image
        console.log(`🖼️ Generating featured image for "${plan.title}"`);
        let featuredImageId = null;
        
        try {
            const imageResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Generate a professional, modern featured image for this blog post titled "${plan.title}" in the ${client.industry} industry. The image should be:
                - Visually appealing and relevant to the topic
                - Professional quality suitable for a blog header
                - Minimum 1400px wide, landscape orientation
                - Very little or no text overlay
                - Clean, modern design
                - Appropriate for ${client.industry} industry
                
                Generate the actual image, not just a description.`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            imageBase64: { type: Type.STRING, description: 'Base64 encoded image data' },
                            altText: { type: Type.STRING, description: 'SEO-friendly ALT text for the image' },
                            description: { type: Type.STRING, description: 'Brief description of the image' }
                        },
                        required: ["imageBase64", "altText", "description"]
                    }
                }
            });
            
            const imageData = JSON.parse(imageResponse.text);
            const filename = `featured-${plan.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.jpg`;
            
            const uploadedImage = await uploadImageToWordPress(
                imageData.imageBase64,
                filename,
                imageData.altText,
                client
            );
            
            featuredImageId = uploadedImage.id;
            console.log(`✅ Featured image uploaded successfully: ${uploadedImage.url}`);
            
        } catch (imageError) {
            console.warn('⚠️ Failed to generate/upload featured image:', imageError.message);
            // Continue without featured image rather than failing the whole process
        }

        // Step 6: Create WordPress Draft
        console.log(`📝 Creating WordPress draft for "${plan.title}"`);
        
        // Handle tags - convert tag names to IDs or create new tags
        let tagIds = [];
        if (plan.keywords && plan.keywords.length > 0) {
            for (const tagName of plan.keywords) {
                try {
                    // First, try to find existing tag
                    const tagSearchUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`;
                    const tagSearchResponse = await fetch(tagSearchUrl, {
                        headers: {
                            'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
                        }
                    });
                    
                    if (tagSearchResponse.ok) {
                        const existingTags = await tagSearchResponse.json();
                        const existingTag = existingTags.find(tag => tag.name.toLowerCase() === tagName.toLowerCase());
                        
                        if (existingTag) {
                            tagIds.push(existingTag.id);
                        } else {
                            // Create new tag
                            const tagCreateUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/tags`;
                            const tagCreateResponse = await fetch(tagCreateUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
                                },
                                body: JSON.stringify({ name: tagName })
                            });
                            
                            if (tagCreateResponse.ok) {
                                const newTag = await tagCreateResponse.json();
                                tagIds.push(newTag.id);
                            }
                        }
                    }
                } catch (tagError) {
                    console.log(`Failed to process tag "${tagName}":`, tagError.message);
                }
            }
        }

        // Prepare post data for draft publication
        const postData = {
            title: plan.title,
            content: contentData.content,
            excerpt: contentData.metaDescription || '',
            status: 'draft', // Always draft for review
            tags: tagIds
        };
        
        // Add featured image if uploaded successfully
        if (featuredImageId) {
            postData.featured_media = featuredImageId;
            console.log(`🖼️ Setting featured image ID: ${featuredImageId}`);
        }
        
        const wpApiUrl = `${client.wp.url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
        
        const wpResponse = await fetch(wpApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${client.wp.username}:${client.wp.appPassword}`).toString('base64')}`
            },
            body: JSON.stringify(postData)
        });

        if (!wpResponse.ok) {
            const errorText = await wpResponse.text();
            console.error('WordPress publishing failed:', errorText);
            throw new Error(`WordPress publishing failed: ${wpResponse.status} ${wpResponse.statusText}`);
        }

        const wpPost = await wpResponse.json();

        // Store the published topic to avoid duplicates
        try {
            await pool.query(
                'INSERT INTO used_topics (client_id, topic) VALUES ($1, $2)',
                [clientId, plan.title]
            );
        } catch (topicError) {
            console.log('Topic already exists or error storing:', topicError.message);
        }

        // Add published blog to internal links database
        try {
            await pool.query(
                'INSERT INTO sitemap_urls (client_id, url, title, description, category, last_modified) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (client_id, url) DO UPDATE SET title = $3, description = $4, category = $5, last_modified = NOW()',
                [
                    clientId, 
                    wpPost.link,
                    plan.title,
                    contentData.metaDescription || 'Generated blog post',
                    'blog'
                ]
            );
            console.log(`✅ Added published blog to internal links database: ${plan.title}`);
        } catch (linkError) {
            console.log('Failed to add published blog to internal links:', linkError.message);
        }

        console.log(`🎉 LUCKY SUCCESS: "${plan.title}" created as draft at ${wpPost.link}`);

        // Return complete success data
        res.json({
            success: true,
            topic: topic,
            sources: sources,
            plan: plan,
            content: contentData,
            publishResult: {
                success: true,
                postId: wpPost.id,
                postUrl: wpPost.link,
                editUrl: wpPost.link ? wpPost.link.replace(/\/$/, '') + '/wp-admin/post.php?post=' + wpPost.id + '&action=edit' : null,
                status: 'draft',
                message: '🍀 Lucky! Blog post generated and created as draft for review!'
            },
            isLucky: true
        });

    } catch (error) {
        console.error('🍀 LUCKY MODE ERROR:', error);
        res.status(500).json({ 
            error: 'Lucky mode failed', 
            details: error.message,
            isLucky: true
        });
    }
});


// Start server
app.listen(port, () => {
  console.log(`Blog MONKEE backend listening at http://localhost:${port}`);
  console.log('🔄 Database migration version: v2.0 - Enhanced crawling support');
  initializeDb();
});