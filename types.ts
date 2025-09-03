export interface Client {
  id: string;
  name: string;
  industry: string;
  websiteUrl: string;
  sitemapUrl?: string;
  uniqueValueProp: string;
  brandVoice: string;
  contentStrategy: string;

  sitemapUrls?: string[];
  usedTopics?: string[];
  ghlLocationId?: string;
}




