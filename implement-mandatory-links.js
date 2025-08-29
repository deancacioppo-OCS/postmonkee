import fs from 'fs';
import path from 'path';

console.log('🚀 Implementing mandatory external links with real-time validation...');

// Read the current server.js file
const serverPath = './backend/server.js';
let serverContent = fs.readFileSync(serverPath, 'utf8');

console.log('📁 Original file loaded, implementing changes...');

// 1. Replace the validateExternalLinks function
const oldValidateFunction = `// Helper function to validate external links
function validateExternalLinks(content) {
    console.log('🔗 Validating external links in content...');
    
    // Extract external links with target="_blank"
    const externalLinkRegex = /<a\\s+[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*target\\s*=\\s*["']_blank["'][^>]*>(.*?)<\\/a>/gi;
    const externalLinks = [];
    let match;
    
    while ((match = externalLinkRegex.exec(content)) !== null) {
        const url = match[1];
        const anchorText = match[2];
        
        // Basic validation for external URLs
        if (url.startsWith('http://') || url.startsWith('https://')) {
            externalLinks.push({
                url: url,
                anchorText: anchorText,
                isValid: true
            });
        } else {
            console.warn(\`⚠️ Invalid external link found: \${url}\`);
        }
    }
    
    console.log(\`📊 Found \${externalLinks.length} external links\`);
    
    if (externalLinks.length < 2) {
        console.warn(\`⚠️ Only \${externalLinks.length} external links found - should be 2-8\`);
    } else if (externalLinks.length > 8) {
        console.warn(\`⚠️ \${externalLinks.length} external links found - maximum should be 8\`);
    } else {
        console.log(\`✅ External link count is optimal: \${externalLinks.length} links\`);
    }
    
    // Analyze link quality and legitimacy
    let wikipediaCount = 0;
    
    externalLinks.forEach((link, index) => {
        const url = link.url.toLowerCase();
        let linkQuality = 'unknown';
        
        if (url.includes('wikipedia.org')) {
            wikipediaCount++;
            linkQuality = 'Wikipedia (should be last resort only)';
        } else if (url.includes('.gov')) {
            linkQuality = 'Government site (highly authoritative)';
        } else if (url.includes('.edu')) {
            linkQuality = 'Educational institution (academic source)';
        } else if (url.includes('reuters.com') || url.includes('bbc.com') || url.includes('wsj.com')) {
            linkQuality = 'Major news publication (credible)';
        } else if (url.includes('naic.org') || url.includes('iii.org') || url.includes('nrca.net') || url.includes('osha.gov')) {
            linkQuality = 'Industry association (excellent choice)';
        } else {
            linkQuality = 'Other source (verify legitimacy)';
        }
        
        console.log(\`🔗 External Link \${index + 1}: "\${link.anchorText}" → \${link.url} [\${linkQuality}]\`);
    });
    
    // Warn about Wikipedia overuse
    if (wikipediaCount > 1) {
        console.warn(\`⚠️ Too many Wikipedia links (\${wikipediaCount}) - Wikipedia should be last resort only\`);
        console.warn(\`💡 Prioritize industry-specific authoritative sources instead\`);
    } else if (wikipediaCount === 1 && externalLinks.length <= 3) {
        console.warn(\`⚠️ Wikipedia used but better industry sources may be available\`);
    }
    
    return externalLinks;
}`;

const newValidateFunction = `// ENHANCED: Real-time URL validation to prevent 404 errors
async function validateUrlExists(url) {
    try {
        console.log(\`🔍 Validating URL: \${url}\`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(url, { 
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BlogMonkee/1.0; +http://blogmonkee.com/bot)'
            }
        });
        
        clearTimeout(timeoutId);
        const isValid = response.ok && response.status < 400;
        console.log(\`\${isValid ? '✅' : '❌'} URL validation: \${url} → \${response.status}\`);
        return isValid;
        
    } catch (error) {
        console.log(\`❌ URL validation failed: \${url} → \${error.message}\`);
        return false;
    }
}

// MANDATORY: Validate external links with real-time URL checking
async function validateExternalLinks(content) {
    console.log('🔗 Validating external links in content...');
    
    // Extract external links with target="_blank"
    const externalLinkRegex = /<a\\s+[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*target\\s*=\\s*["']_blank["'][^>]*>(.*?)<\\/a>/gi;
    const externalLinks = [];
    let match;
    
    while ((match = externalLinkRegex.exec(content)) !== null) {
        const url = match[1];
        const anchorText = match[2];
        
        // Only process external links (with http/https)
        if (url.includes('http://') || url.includes('https://')) {
            externalLinks.push({ url, anchorText });
        } else {
            console.log(\`⚠️ Invalid external link found: \${url}\`);
        }
    }
    
    console.log(\`📊 Found \${externalLinks.length} external links\`);
    
    // MANDATORY: Require minimum 2 external links
    if (externalLinks.length < 2) {
        console.error(\`❌ MANDATORY EXTERNAL LINKS MISSING: Only \${externalLinks.length} external links found - MINIMUM 2 required\`);
        throw new Error(\`Content validation failed: Must include at least 2 external links, found only \${externalLinks.length}\`);
    } else if (externalLinks.length > 8) {
        console.warn(\`⚠️ \${externalLinks.length} external links found - maximum should be 8\`);
    } else {
        console.log(\`✅ External link count is optimal: \${externalLinks.length} links\`);
    }
    
    // Real-time URL validation for all external links
    console.log('🌐 Starting real-time URL validation...');
    const validationResults = [];
    
    for (const link of externalLinks) {
        const isValid = await validateUrlExists(link.url);
        validationResults.push({
            url: link.url,
            anchorText: link.anchorText,
            isValid: isValid
        });
        
        if (!isValid) {
            console.error(\`❌ BROKEN LINK DETECTED: "\${link.anchorText}" → \${link.url}\`);
        }
    }
    
    // Check if any links are broken
    const brokenLinks = validationResults.filter(result => !result.isValid);
    if (brokenLinks.length > 0) {
        console.error(\`❌ CONTENT VALIDATION FAILED: \${brokenLinks.length} broken external links detected\`);
        brokenLinks.forEach(link => {
            console.error(\`   💔 Broken: "\${link.anchorText}" → \${link.url}\`);
        });
        throw new Error(\`Content validation failed: \${brokenLinks.length} external links are broken or inaccessible\`);
    }
    
    // Analyze link quality and legitimacy
    let wikipediaCount = 0;
    
    validationResults.forEach((result, index) => {
        const url = result.url.toLowerCase();
        let linkQuality = 'unknown';
        
        if (url.includes('wikipedia.org')) {
            wikipediaCount++;
            linkQuality = 'Wikipedia (should be last resort only)';
        } else if (url.includes('.gov')) {
            linkQuality = 'Government site (highly authoritative)';
        } else if (url.includes('.edu')) {
            linkQuality = 'Educational institution (academic source)';
        } else if (url.includes('reuters.com') || url.includes('bbc.com') || url.includes('wsj.com')) {
            linkQuality = 'Major news publication (credible)';
        } else if (url.includes('naic.org') || url.includes('iii.org') || url.includes('nrca.net') || url.includes('osha.gov')) {
            linkQuality = 'Industry association (excellent choice)';
        } else {
            linkQuality = 'Other source (verify legitimacy)';
        }
        
        const validationStatus = result.isValid ? '[WORKING ✅]' : '[BROKEN ❌]';
        console.log(\`🔗 External Link \${index + 1}: "\${result.anchorText}" → \${result.url} [\${linkQuality}] \${validationStatus}\`);
    });
    
    // Warn about Wikipedia overuse
    if (wikipediaCount > 1) {
        console.warn(\`⚠️ Too many Wikipedia links (\${wikipediaCount}) - Wikipedia should be last resort only\`);
        console.warn(\`💡 Prioritize industry-specific authoritative sources instead\`);
    } else if (wikipediaCount === 1 && externalLinks.length <= 3) {
        console.warn(\`⚠️ Wikipedia used but better industry sources may be available\`);
    }
    
    console.log(\`✅ All \${externalLinks.length} external links validated and working\`);
    return externalLinks;
}`;

// 2. Replace the function
serverContent = serverContent.replace(oldValidateFunction, newValidateFunction);

// 3. Update all validateExternalLinks calls to be async
serverContent = serverContent.replace(
    /validateExternalLinks\(contentData\.content\);/g,
    'await validateExternalLinks(contentData.content);'
);

// 4. Update external links requirements in prompts
const oldExternalLinksReq = `EXTERNAL LINKS REQUIREMENTS - CRITICAL 404 PREVENTION:
            - Include 2-8 relevant external links to VERIFIED, WORKING websites only
            - 🚫 NEVER CREATE OR GUESS URLs - Only use the verified links provided below
            - 🚫 NEVER add paths, subdirectories, or specific pages unless explicitly listed
            - ✅ ONLY USE THESE VERIFIED WORKING URLS (choose 2-8 that are relevant):
              \${getVerifiedExternalLinks(client.industry).map(url => \`* \${url}\`).join('\\n              ')}
            
            LINKING RULES:
            - Use EXACT URLs from the list above - DO NOT modify or add paths
            - If you need a specific page, only use URLs that include the full path (like the iii.org example)
            - For general references, use root domains only (like https://www.naic.org)
            - Links must be contextually integrated into the content naturally
            - Use descriptive, keyword-rich anchor text that accurately reflects the linked content
            - Format: <a href="EXACT_URL_FROM_LIST" target="_blank" rel="noopener noreferrer">descriptive anchor text</a>
            
            EXAMPLES OF CORRECT USAGE:
            - "The <a href=\\"https://www.naic.org\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">National Association of Insurance Commissioners</a> provides industry oversight..."
            - "According to <a href=\\"https://www.iii.org\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">Insurance Information Institute</a> research..."
            - "Recent <a href=\\"https://www.reuters.com\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">Reuters</a> reporting shows..."
            
            ❌ NEVER DO THIS:
            - https://www.naic.org/consumer-guides/auto-insurance (path doesn't exist)
            - https://www.iii.org/statistics/liability-coverage (made up path)  
            - Any URL not in the verified list above
            
            PRIORITY ORDER:
            1. Industry-specific verified URLs (top of list)
            2. Government sources (.gov domains from list)
            3. General news sources (bottom of list)
            4. Wikipedia ONLY as absolute last resort for basic definitions`;

const newExternalLinksReq = `🚨 MANDATORY EXTERNAL LINKS - CRITICAL REQUIREMENT:
            - YOU MUST INCLUDE EXACTLY 2-8 WORKING EXTERNAL LINKS - NO EXCEPTIONS
            - Content will be REJECTED if it has fewer than 2 external links
            - All links will be tested in real-time - broken links cause rejection
            - ✅ ONLY USE THESE VERIFIED WORKING URLS (choose 2-8 that are relevant):
              \${getVerifiedExternalLinks(client.industry).map(url => \`* \${url}\`).join('\\n              ')}
            
            MANDATORY LINKING RULES:
            - Use EXACT URLs from the list above - DO NOT modify or add paths
            - Format: <a href="EXACT_URL_FROM_LIST" target="_blank" rel="noopener noreferrer">descriptive anchor text</a>
            - Distribute 2-8 links naturally throughout the article
            - Each link must provide genuine value and context
            
            ❌ CONTENT WILL BE REJECTED IF:
            - Fewer than 2 external links included
            - Any external links return 404 errors or are inaccessible
            - URLs not from the verified list above
            - Links missing target="_blank" rel="noopener noreferrer"
            
            This is a MANDATORY requirement - not optional.`;

// Replace external links requirements
serverContent = serverContent.replace(new RegExp(oldExternalLinksReq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newExternalLinksReq);

// 5. Write the updated file
fs.writeFileSync(serverPath, serverContent);

console.log('✅ Implementation complete!');
console.log('📊 Changes applied:');
console.log('   - Enhanced validateExternalLinks function with real-time validation');
console.log('   - Added validateUrlExists helper function');
console.log('   - Updated all validateExternalLinks calls to async');
console.log('   - Made external links absolutely mandatory');
console.log('   - Added content rejection for missing/broken links');
console.log('🚀 Ready to commit and deploy!');
