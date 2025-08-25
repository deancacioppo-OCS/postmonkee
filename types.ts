export interface Client {
  id: string;
  name: string;
  industry: string;
  websiteUrl: string;
  uniqueValueProp: string;
  brandVoice: string;
  contentStrategy: string;
  wp: { url: string; username: string; appPassword?: string };
  sitemapUrls?: string[];
  usedTopics?: string[];
}

export interface BlogPost {
  topic: string;
  title: string;
  angle: string;
  keywords: string[];
  outline: string;
  content: string; // HTML
  featuredImageBase64: string;
  inBodyImages: { heading: string; base64: string }[];
  faq: { question: string; answer: string }[];
}

export interface BlogPlan {
  title: string;
  angle: string;
  keywords: string[];
}


export enum GenerationStep {
  TOPIC = 'Topic Discovery',
  PLAN = 'Content Planning',
  STRUCTURE = 'Outline Creation',
  CONTENT = 'Content Generation',
  IMAGES = 'Image Creation',
  SEO = 'SEO Enhancement',
}

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'error';