export default async function handler(req, res) {
  // CORS configuration for native app access
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages, context } = req.body;
    
    // Check for API keys
    const GROQ_API_KEY =
      process.env.GROQ_API_KEY_PIGPULSE ||
      process.env.GROQ_API_KEY;
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const GEMINI_API_KEY =
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_1;
    const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;

    if (!GROQ_API_KEY && !OPENROUTER_API_KEY && !GEMINI_API_KEY && !SILICONFLOW_API_KEY) {
      return res.status(200).json({ 
        reply: "System Notice: I am operating in Mock Mode because the Master has not yet injected GROQ_API_KEY_PIGPULSE, GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY into the Vercel environment. My logic circuits are standing by for live integration."
      });
    }

    const systemPrompt = {
      role: 'system',
      content: `You are the HUSH HOG Advisor, an expert AI familiar specializing in swine health, thermal telemetry interpretation, and respiratory acoustic analysis. Provide short, concise, and highly professional technical responses. Do not use markdown headers unless necessary. Current telemetry context: ${JSON.stringify(context || {})}`
    };

    let apiUrl = '';
    let apiKey = '';
    let model = '';

    if (GROQ_API_KEY) {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      apiKey = GROQ_API_KEY;
      model = 'llama-3.3-70b-versatile';
    } else if (GEMINI_API_KEY) {
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      apiKey = GEMINI_API_KEY;
      model = 'gemini-2.5-flash';
    } else if (SILICONFLOW_API_KEY) {
      apiUrl = 'https://api.siliconflow.com/v1/chat/completions';
      apiKey = SILICONFLOW_API_KEY;
      model = 'deepseek-ai/DeepSeek-V4-Flash';
    } else {
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      apiKey = OPENROUTER_API_KEY;
      model = 'meta-llama/llama-3.3-70b-instruct:free';
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [systemPrompt, ...messages],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("AI API Error:", data);
      throw new Error(data.error?.message || 'Failed to fetch from AI Provider');
    }

    res.status(200).json({ reply: data.choices[0].message.content });
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
