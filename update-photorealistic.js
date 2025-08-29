import fs from 'fs';

console.log('🖼️ Updating DALL-E 3 prompts for photorealistic images...');

// Read the server.js file
const serverPath = './backend/server.js';
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Find and replace the image prompt
const oldImagePrompt = `        const imagePrompt = \`Create a professional, modern featured image for a blog post titled "\${title}" in the \${industry} industry. 

CRITICAL REQUIREMENTS:
- NO TEXT or very minimal text in the image
- Visually represent the title/topic through imagery, symbols, and concepts
- Professional quality suitable for a blog header
- Clean, modern design with landscape orientation
- High quality and engaging
- Appropriate for \${industry} industry content
- Use visual metaphors and symbolic elements to convey the topic
- Focus on imagery that tells the story without words

The image should communicate the essence of "\${title}" through pure visual elements, professional photography style, and symbolic representation rather than text overlay.\`;`;

const newImagePrompt = `        const imagePrompt = \`Create a PHOTOREALISTIC featured image for a blog post titled "\${title}" in the \${industry} industry. 

CRITICAL REQUIREMENTS - PHOTOREALISTIC STYLE:
- PHOTOREALISTIC photography style - no illustrations, cartoons, or artistic renderings
- Real-world photography aesthetic with natural lighting and textures
- High-definition, crisp detail that looks like a professional photograph
- NO TEXT or very minimal text in the image
- Authentic, believable scenes and objects
- Professional camera quality with proper depth of field
- Natural colors and realistic materials/surfaces

VISUAL CONTENT:
- Visually represent the title/topic through real objects, people, or environments
- Use actual business settings, real equipment, or genuine scenarios
- Professional quality suitable for a blog header
- Clean composition with landscape orientation
- Appropriate for \${industry} industry content
- Focus on realistic imagery that tells the story without words

PHOTOGRAPHY STYLE:
- Shot with professional camera equipment
- Natural or professional studio lighting
- Sharp focus with realistic depth of field
- Authentic textures and materials
- Real-world environments and settings
- High-resolution photographic quality

The image should look like a genuine photograph taken by a professional photographer, communicating the essence of "\${title}" through photorealistic visual elements.\`;`;

// Replace the image prompt
serverContent = serverContent.replace(oldImagePrompt, newImagePrompt);

// Also update the quality setting for better photorealism
serverContent = serverContent.replace(
    'quality: "standard", // Standard quality for faster generation',
    'quality: "hd", // HD quality for enhanced photorealism'
);

// Write the updated file
fs.writeFileSync(serverPath, serverContent);

console.log('✅ Photorealistic image prompts implemented!');
console.log('📊 Changes applied:');
console.log('   - Updated DALL-E 3 prompt for photorealistic style');
console.log('   - Enhanced quality setting to "hd" for better realism');
console.log('   - Added professional photography requirements');
console.log('   - Specified natural lighting and authentic textures');
console.log('🚀 Ready to generate photorealistic featured images!');
