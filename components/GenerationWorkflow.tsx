import React, { useState, useCallback } from 'react';
import { Client, BlogPlan, BlogOutline, BlogContent, BlogImages, CompleteBlog, WordPressPublishResult } from '../types';
import * as api from '../services/geminiService';
import Spinner from './Spinner';

interface GenerationWorkflowProps {
  client: Client | null;
}

const GenerationWorkflow: React.FC<GenerationWorkflowProps> = ({ client }) => {
  const [topic, setTopic] = useState<string>('');
  const [sources, setSources] = useState<any[]>([]);
  const [plan, setPlan] = useState<BlogPlan | null>(null);
  const [outline, setOutline] = useState<BlogOutline | null>(null);
  const [content, setContent] = useState<BlogContent | null>(null);
  const [images, setImages] = useState<BlogImages | null>(null);
  const [publishResult, setPublishResult] = useState<WordPressPublishResult | null>(null);
  
  const [topicLoading, setTopicLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [completeBlogLoading, setCompleteBlogLoading] = useState(false);

  const [topicError, setTopicError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [completeBlogError, setCompleteBlogError] = useState<string | null>(null);

  const resetAllSteps = () => {
    setTopic('');
    setSources([]);
    setPlan(null);
    setOutline(null);
    setContent(null);
    setImages(null);
    setPublishResult(null);
  };

  const handleDiscoverTopic = useCallback(async () => {
    if (!client) return;
    setTopicLoading(true);
    setTopicError(null);
    resetAllSteps(); // Reset all subsequent steps
    try {
      const result = await api.generateTopic(client.id);
      setTopic(result.topic);
      setSources(result.sources);
    } catch (err) {
      setTopicError('Failed to discover a topic. Please try again.');
    } finally {
      setTopicLoading(false);
    }
  }, [client]);

  const handleCreatePlan = useCallback(async () => {
    if (!client || !topic) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    setOutline(null); // Reset subsequent steps
    setContent(null);
    setImages(null);
    setPublishResult(null);
    try {
        const result = await api.generatePlan(client.id, topic);
        setPlan(result);
    } catch (err) {
        setPlanError('Failed to create a content plan. Please try again.');
    } finally {
        setPlanLoading(false);
    }
  }, [client, topic]);

  const handleCreateOutline = useCallback(async () => {
    if (!client || !topic || !plan) return;
    setOutlineLoading(true);
    setOutlineError(null);
    setOutline(null);
    setContent(null); // Reset subsequent steps
    setImages(null);
    setPublishResult(null);
    try {
        const result = await api.generateOutline(client.id, topic, plan.title, plan.angle, plan.keywords);
        setOutline(result);
    } catch (err) {
        setOutlineError('Failed to create outline. Please try again.');
    } finally {
        setOutlineLoading(false);
    }
  }, [client, topic, plan]);

  const handleGenerateContent = useCallback(async () => {
    if (!client || !topic || !plan || !outline) return;
    setContentLoading(true);
    setContentError(null);
    setContent(null);
    setImages(null); // Reset subsequent steps
    setPublishResult(null);
    try {
        const result = await api.generateContent(client.id, topic, plan.title, plan.angle, plan.keywords, outline.outline);
        setContent(result);
    } catch (err) {
        setContentError('Failed to generate content. Please try again.');
    } finally {
        setContentLoading(false);
    }
  }, [client, topic, plan, outline]);

  const handleGenerateImages = useCallback(async () => {
    if (!client || !plan) return;
    setImagesLoading(true);
    setImagesError(null);
    setImages(null);
    try {
        // Extract headings from outline if available
        const headings = outline?.outline.match(/^#+\s+(.+)$/gm)?.map(h => h.replace(/^#+\s+/, '')) || [];
        const result = await api.generateImages(client.id, plan.title, headings);
        setImages(result);
    } catch (err) {
        setImagesError('Failed to generate images. Please try again.');
    } finally {
        setImagesLoading(false);
    }
  }, [client, plan, outline]);

  const handlePublishToWordPress = useCallback(async () => {
    if (!client || !plan || !content) return;
    setPublishLoading(true);
    setPublishError(null);
    setPublishResult(null);
    try {
        const result = await api.publishToWordPress(
            client.id, 
            plan.title, 
            content.content, 
            content.metaDescription,
            undefined, // featuredImage - would be base64 if we had actual images
            plan.keywords, // use keywords as tags
            [] // categories - could be derived from client industry
        );
        setPublishResult(result);
    } catch (err) {
        setPublishError('Failed to publish to WordPress. Please try again.');
    } finally {
        setPublishLoading(false);
    }
  }, [client, plan, content]);

  const handleGenerateCompleteBlog = useCallback(async () => {
    if (!client) return;
    setCompleteBlogLoading(true);
    setCompleteBlogError(null);
    resetAllSteps();
    try {
        const result = await api.generateCompleteBlog(client.id);
        setTopic(result.topic);
        setSources(result.sources);
        setPlan(result.plan);
        setContent(result.content);
        // Auto-set outline as "Generated" since it's included in the complete generation
        setOutline({ outline: "Complete outline generated", estimatedWordCount: result.content.wordCount, seoScore: 85 });
    } catch (err) {
        setCompleteBlogError('Failed to generate complete blog. Please try again.');
    } finally {
        setCompleteBlogLoading(false);
    }
  }, [client]);

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        <h2 className="text-xl font-semibold">Select a Client</h2>
        <p>Choose a client from the list to start generating content.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-200 mb-1">
        Generation Workflow
      </h2>
      <p className="text-cyan-400 font-medium mb-4">{client.name}</p>

      <div className="space-y-6">
        {/* Step 1: Topic Discovery */}
        <WorkflowStep
          title="Step 1: Topic Discovery"
          onAction={handleDiscoverTopic}
          actionText="Discover Topic"
          isLoading={topicLoading}
          isDone={!!topic}
          error={topicError}
          isActionDisabled={topicLoading || planLoading}
        >
          {topic && (
            <div className="mt-2 p-3 bg-slate-900 rounded-md">
              <p className="font-semibold text-lg text-slate-200">{topic}</p>
              {sources && sources.length > 0 && (
                <div className="mt-2">
                    <p className="text-xs text-slate-400">Sources:</p>
                    <ul className="text-xs list-disc list-inside">
                        {sources.map((source, index) => (
                           <li key={index}><a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">{source.web.title}</a></li>
                        ))}
                    </ul>
                </div>
              )}
            </div>
          )}
        </WorkflowStep>
        
        {/* Step 2: Content Planning */}
        <WorkflowStep
          title="Step 2: Content Planning"
          onAction={handleCreatePlan}
          actionText="Create Plan"
          isLoading={planLoading}
          isDone={!!plan}
          error={planError}
          isActionDisabled={!topic || planLoading || topicLoading}
        >
            {plan && (
                <div className="mt-2 p-3 bg-slate-900 rounded-md space-y-2">
                    <h4 className="font-bold text-slate-200">{plan.title}</h4>
                    <p><strong className="text-slate-400">Angle:</strong> {plan.angle}</p>
                    <div>
                        <strong className="text-slate-400">Keywords:</strong>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {plan.keywords.map(kw => <span key={kw} className="bg-slate-700 text-cyan-300 text-xs font-medium px-2.5 py-0.5 rounded-full">{kw}</span>)}
                        </div>
                    </div>
                </div>
            )}
        </WorkflowStep>

      </div>
    </div>
  );
};

// Helper component for workflow steps
const WorkflowStep = ({ title, children, onAction, actionText, isLoading, isDone, error, isActionDisabled }) => (
    <div className="p-4 bg-slate-700/50 rounded-lg">
        <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-slate-300 flex items-center gap-2">
                {isDone && <span className="text-green-400">✔</span>}
                {title}
            </h3>
            <button
                onClick={onAction}
                disabled={isActionDisabled}
                className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-1 px-3 rounded-md text-sm transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center gap-2"
            >
                {isLoading && <Spinner small />}
                {actionText}
            </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        {children}
    </div>
);

export default GenerationWorkflow;
