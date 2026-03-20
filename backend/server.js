// server.js - Express backend for Resume Optimizer (Gemini Edition)
import express, { json } from 'express';
import cors from 'cors';
import { config } from 'dotenv';

config();

const app = express();
app.use(cors());
app.use(json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Optimize resume endpoint
app.post('/api/optimize', async (req, res) => {
  const { jobDescription, resumeLatex } = req.body;

  if (!jobDescription || !resumeLatex) {
    return res.status(400).json({
      error: 'Missing jobDescription or resumeLatex'
    });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const MODEL_ID = 'gemini-2.5-flash';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{
              text: `JOB DESCRIPTION:
${jobDescription}

CURRENT RESUME LATEX:
${resumeLatex}

OUTPUT: Optimized LaTeX resume code only (no other text)`
            }]
          }
        ],
        systemInstruction: {
          parts: [{
            text: `You are an expert resume optimizer. Your task is to align a resume with a job description.

IMPORTANT INSTRUCTIONS:
1. Output ONLY valid LaTeX code - no explanations, markdown, or preamble.
2. Do not include \\documentclass or \\begin{document} tags unless they were in the original.
3. Preserve the original document structure and formatting commands.
4. Incorporate keywords and required skills from the job description.
5. Reorder and rephrase content to match job requirements (99% alignment target).
7. Start output immediately with the first LaTeX command.`
          }]
        },
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.4, // Lower temperature for better structure preservation
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    // Extract text and clean potential Markdown wrappers
    let optimizedLatex = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    optimizedLatex = optimizedLatex.replace(/^```latex\n?/, '').replace(/\n?```$/, '').trim();

    if (!optimizedLatex) {
      throw new Error("Gemini returned an empty response.");
    }

    // Calculate match score (Simple heuristic)
    const jobKeywords = jobDescription
      .toLowerCase()
      .split(/[\s,\n,\.,\!,?]+/)
      .filter(w => w.length > 4); // Filter out short filler words
    
    const resumeWords = optimizedLatex
      .toLowerCase()
      .split(/[\s,\n]+/)
      .filter(w => w.length > 4);
    
    const matchedKeywords = jobKeywords.filter(kw =>
      resumeWords.some(rw => rw.includes(kw) || kw.includes(rw))
    );
    
    // Set unique set to avoid over-counting repeated words
    const uniqueMatches = [...new Set(matchedKeywords)];
    const uniqueJobKeywords = [...new Set(jobKeywords)];
    
    const matchScore = Math.min(
      98,
      Math.round((uniqueMatches.length / uniqueJobKeywords.length) * 100)
    );

    res.json({
      optimizedLatex,
      matchScore,
      keywordsMatched: uniqueMatches.length,
      totalKeywords: uniqueJobKeywords.length
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Resume Optimizer API running on port ${PORT} with Gemini 2.5 Flash`);
});