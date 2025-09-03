import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import crypto from 'crypto';
import pg from 'pg';
import FormData from 'form-data';
import OpenAI from 'openai';
import sharp from 'sharp';
import { Readable } from 'stream';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseString } from 'xml2js';
// Re-enable ghl-integration imports to test
import {
  createTestEndpoint,
  createGBPPostEndpoint,
  getGBPPostsEndpoint,
  manageGHLSubAccountsEndpoint,
  getGHLSubAccountsEndpoint,
  testGHLConnectionEndpoint
} from './ghl-integration.js';

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
        "ghlLocationId" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add sitemapUrl column if it doesn't exist (for existing databases)
    try {
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'sitemapUrl';
      `);
      
      if (columnCheck.rows.length === 0) {
        await client.query(`ALTER TABLE clients ADD COLUMN "sitemapUrl" TEXT;`);
        console.log('✅ sitemapUrl column added');
      } else {
        console.log('✅ sitemapUrl column already exists');
      }
    } catch (alterError) {
      console.log('Note: Could not add sitemapUrl column:', alterError.message);
    }

    // Add ghlLocationId column if it doesn't exist
    try {
      const ghlColumnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'ghlLocationId';
      `);
      
      if (ghlColumnCheck.rows.length === 0) {
        await client.query(`ALTER TABLE clients ADD COLUMN "ghlLocationId" TEXT;`);
        console.log('✅ ghlLocationId column added');
      } else {
        console.log('✅ ghlLocationId column already exists');
      }
    } catch (alterError) {
      console.log('Note: Could not add ghlLocationId column:', alterError.message);
    }

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

    // Create topic external links table for real-time Google Search results
    await client.query(`
      CREATE TABLE IF NOT EXISTS topic_external_links (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        domain TEXT,
        authority_score INTEGER DEFAULT 0,
        is_validated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        UNIQUE(client_id, topic, url)
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

    // Create gbp_posts table for Google Business Profile posts
    await client.query(`
      CREATE TABLE IF NOT EXISTS gbp_posts (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url VARCHAR(500),
        more_info_url VARCHAR(500),
        cta_text VARCHAR(100) DEFAULT 'Learn More',
        status VARCHAR(50) DEFAULT 'draft',
        scheduled_at TIMESTAMP WITH TIME ZONE,
        published_at TIMESTAMP WITH TIME ZONE,
        ghl_post_id VARCHAR(200),
        ghl_account_id VARCHAR(200),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
    `);

    // Create ghl_sub_accounts table for GoHighLevel sub-account management
    await client.query(`
      CREATE TABLE IF NOT EXISTS ghl_sub_accounts (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        location_id VARCHAR(200) NOT NULL,
        sub_account_name VARCHAR(200),
        access_token TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        UNIQUE(client_id, location_id)
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
        'https://monkee.ai',
        'https://www.monkee.ai', 
        'https://blog-monkee-frontend.onrender.com',
        // Allow any Netlify domain (legacy support)
        /https:\/\/.*\.netlify\.app$/,
        // Allow any Netlify custom domain (legacy support)
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

// Initialize OpenAI for image generation
let openai = null;
try {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️ OPENAI_API_KEY not set - image generation will be disabled');
    } else {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        console.log('✅ OpenAI initialized successfully for image generation');
    }
} catch (error) {
    console.error('❌ Failed to initialize OpenAI:', error.message);
}

// --- API Routes ---

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'postMONKEE Backend is running' });
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
  const { name, industry, websiteUrl, sitemapUrl, uniqueValueProp, brandVoice, contentStrategy, ghlLocationId } = req.body;
  const newClient = {
    id: crypto.randomUUID(),
    name, industry, websiteUrl, sitemapUrl, uniqueValueProp, brandVoice, contentStrategy, ghlLocationId
  };
  try {
    const result = await pool.query(
      `INSERT INTO clients (id, name, industry, "websiteUrl", "sitemapUrl", "uniqueValueProp", "brandVoice", "contentStrategy", "ghlLocationId") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [newClient.id, newClient.name, newClient.industry, newClient.websiteUrl, newClient.sitemapUrl, newClient.uniqueValueProp, newClient.brandVoice, newClient.contentStrategy, newClient.ghlLocationId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// UPDATE a client
app.put('/api/clients/:id', async (req, res) => {
    const { name, industry, websiteUrl, sitemapUrl, uniqueValueProp, brandVoice, contentStrategy, ghlLocationId } = req.body;
    try {
        const result = await pool.query(
            `UPDATE clients SET 
             name = $1, industry = $2, "websiteUrl" = $3, "sitemapUrl" = $4, "uniqueValueProp" = $5, 
             "brandVoice" = $6, "contentStrategy" = $7, "ghlLocationId" = $8, "updatedAt" = NOW()
             WHERE id = $9 RETURNING *`,
            [name, industry, websiteUrl, sitemapUrl, uniqueValueProp, brandVoice, contentStrategy, ghlLocationId, req.params.id]
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

// ===== Register GoHighLevel API Endpoints =====
console.log('🔄 Registering ghl-integration endpoints...');
try {
  createTestEndpoint(app, pool, ai, openai, axios);
  console.log('✅ createTestEndpoint registered');
  
  createGBPPostEndpoint(app, pool, ai, openai, axios);
  console.log('✅ createGBPPostEndpoint registered');
  
  getGBPPostsEndpoint(app, pool);
  console.log('✅ getGBPPostsEndpoint registered');
  
  manageGHLSubAccountsEndpoint(app, pool);
  console.log('✅ manageGHLSubAccountsEndpoint registered');
  
  getGHLSubAccountsEndpoint(app, pool);
  console.log('✅ getGHLSubAccountsEndpoint registered');
  
  testGHLConnectionEndpoint(app, pool);
  console.log('✅ testGHLConnectionEndpoint registered');
  
  console.log('✅ All ghl-integration endpoints registered successfully');
} catch (error) {
  console.error('❌ Error registering ghl-integration endpoints:', error.message);
  console.error('❌ Full error:', error);
}

// Simple test endpoint to verify server is working
app.post('/api/test', (req, res) => {
  console.log('🧪 Simple test endpoint called');
  res.json({ success: true, message: 'Simple test endpoint working' });
});

// Start server
app.listen(port, () => {
  console.log(`postMONKEE backend listening at http://localhost:${port}`);
  console.log('🔄 Database migration version: v3.2 - GBP posts and GoHighLevel integration (Blog functionality removed)');
  initializeDb();
});
