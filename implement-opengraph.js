import fs from 'fs';

console.log('🌐 Implementing Open Graph meta tags for featured images...');

// Read the current server.js file
const serverPath = './backend/server.js';
let serverContent = fs.readFileSync(serverPath, 'utf8');

console.log('📁 File loaded, adding Open Graph functionality...');

// 1. Add the Open Graph helper function after the FAQ function
const insertPoint = `    return faqHTML;
}

// Helper function to generate image in parallel using DALL-E 3`;

const openGraphFunction = `    return faqHTML;
}

// Helper function to generate Open Graph meta tags for social sharing
function generateOpenGraphTags(title, description, imageUrl, pageUrl, clientName) {
    if (!imageUrl) {
        return ''; // No Open Graph tags if no image
    }
    
    const openGraphHTML = \`
<!-- Open Graph Meta Tags for Social Media Sharing -->
<meta property="og:title" content="\${title}" />
<meta property="og:description" content="\${description}" />
<meta property="og:image" content="\${imageUrl}" />
<meta property="og:url" content="\${pageUrl}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="\${clientName}" />
<meta property="article:author" content="\${clientName}" />

<!-- Twitter Card Meta Tags -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="\${title}" />
<meta name="twitter:description" content="\${description}" />
<meta name="twitter:image" content="\${imageUrl}" />

<!-- Additional SEO Meta Tags -->
<meta name="description" content="\${description}" />
<meta name="robots" content="index, follow" />
\`;
    
    return openGraphHTML;
}

// Helper function to generate image in parallel using DALL-E 3`;

// Replace the insertion point
serverContent = serverContent.replace(insertPoint, openGraphFunction);

// 2. Update the WordPress publishing to include Open Graph tags
// Find the regular publish endpoint content preparation
const oldContentPrep1 = `        // Prepare post data
        const postData = {
            title: title,
            content: content,
            excerpt: metaDescription || '',
            status: 'draft', // Always start as draft for review
            tags: tagIds // Use tag IDs
        };`;

const newContentPrep1 = `        // Add Open Graph meta tags if featured image is available
        let enhancedContent = content;
        if (featuredImageId) {
            try {
                const mediaResponse = await fetch(\`\${client.wp.url.replace(/\\/$/, '')}/wp-json/wp/v2/media/\${featuredImageId}\`, {
                    headers: {
                        'Authorization': \`Basic \${Buffer.from(\`\${client.wp.username}:\${client.wp.appPassword}\`).toString('base64')}\`
                    }
                });
                
                if (mediaResponse.ok) {
                    const mediaData = await mediaResponse.json();
                    const imageUrl = mediaData.source_url;
                    
                    const openGraphTags = generateOpenGraphTags(
                        title,
                        metaDescription || \`Professional \${client.industry} insights from \${client.name}\`,
                        imageUrl,
                        \`\${client.wp.url}\`,
                        client.name
                    );
                    
                    enhancedContent = openGraphTags + content;
                    console.log(\`🌐 Added Open Graph meta tags with featured image: \${imageUrl}\`);
                }
            } catch (ogError) {
                console.warn('⚠️ Failed to add Open Graph tags:', ogError.message);
            }
        }

        // Prepare post data
        const postData = {
            title: title,
            content: enhancedContent,
            excerpt: metaDescription || '',
            status: 'draft', // Always start as draft for review
            tags: tagIds // Use tag IDs
        };`;

// Replace the regular publish content preparation
serverContent = serverContent.replace(oldContentPrep1, newContentPrep1);

// 3. Update Lucky Mode publishing
const oldLuckyPrep = `        // Combine main content with FAQ section
        const fullContent = contentData.content + faqHTML;
        
        // Prepare post data for draft publication
        const postData = {
            title: plan.title,
            content: fullContent,
            excerpt: contentData.metaDescription || '',
            status: 'draft', // Always draft for review
            tags: tagIds
        };`;

const newLuckyPrep = `        // Combine main content with FAQ section
        let fullContent = contentData.content + faqHTML;
        
        // Add Open Graph meta tags if featured image is available
        if (featuredImageId) {
            try {
                const mediaResponse = await fetch(\`\${client.wp.url.replace(/\\/$/, '')}/wp-json/wp/v2/media/\${featuredImageId}\`, {
                    headers: {
                        'Authorization': \`Basic \${Buffer.from(\`\${client.wp.username}:\${client.wp.appPassword}\`).toString('base64')}\`
                    }
                });
                
                if (mediaResponse.ok) {
                    const mediaData = await mediaResponse.json();
                    const imageUrl = mediaData.source_url;
                    
                    const openGraphTags = generateOpenGraphTags(
                        plan.title,
                        contentData.metaDescription || \`Professional \${client.industry} insights from \${client.name}\`,
                        imageUrl,
                        \`\${client.wp.url}\`,
                        client.name
                    );
                    
                    fullContent = openGraphTags + fullContent;
                    console.log(\`🌐 Added Open Graph meta tags with featured image: \${imageUrl}\`);
                }
            } catch (ogError) {
                console.warn('⚠️ Failed to add Open Graph tags:', ogError.message);
            }
        }
        
        // Prepare post data for draft publication
        const postData = {
            title: plan.title,
            content: fullContent,
            excerpt: contentData.metaDescription || '',
            status: 'draft', // Always draft for review
            tags: tagIds
        };`;

// Replace the Lucky Mode content preparation
serverContent = serverContent.replace(oldLuckyPrep, newLuckyPrep);

// Write the updated file
fs.writeFileSync(serverPath, serverContent);

console.log('✅ Open Graph implementation complete!');
console.log('📊 Changes applied:');
console.log('   - Added generateOpenGraphTags helper function');
console.log('   - Enhanced regular WordPress publishing with Open Graph');
console.log('   - Enhanced Lucky Mode publishing with Open Graph');
console.log('   - Added Twitter Card meta tags');
console.log('   - Featured images now become og:image for social sharing');
console.log('🚀 Ready to commit and deploy!');
