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
    
    // Check for API keys (priority: Groq → Gemini → SiliconFlow → OpenRouter)
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
        reply: "⚠️ System Notice: I am operating in offline mode because no AI API key (GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY) has been configured in the Vercel environment yet. I can still answer questions using my built-in veterinary knowledge base."
      });
    }

    // Build a rich, data-aware system prompt
    const hasLiveData = context && (context.sensors || context.recentAlerts || context.roster);
    
    let dataSection = '';
    if (hasLiveData) {
      dataSection += '\n\n=== LIVE FARM DATA (from Firebase RTDB) ===';
      
      if (context.sensors && context.sensors.length > 0) {
        dataSection += '\n\nSENSOR READINGS:';
        context.sensors.forEach(s => {
          dataSection += `\n- ${s.label}: ${s.value}${s.unit} [Status: ${s.status}] (last updated: ${s.lastUpdated})`;
        });
      }
      
      if (context.recentAlerts && context.recentAlerts.length > 0) {
        dataSection += '\n\nACTIVE ALERTS:';
        context.recentAlerts.forEach(a => {
          dataSection += `\n- [${a.severity}] ${a.type}: ${a.message} (device: ${a.deviceId})`;
        });
      }
      
      if (context.roster && context.roster.length > 0) {
        dataSection += '\n\nPIG ROSTER:';
        context.roster.forEach(p => {
          const tags = p.tags && p.tags.length > 0 ? ` [Tags: ${p.tags.join(', ')}]` : '';
          dataSection += `\n- ${p.name}: ${p.healthStatus}${tags} (last seen: ${p.lastSeen})`;
        });
      }
      
      dataSection += '\n\n=== END LIVE DATA ===';
    }

    const systemPrompt = {
      role: 'system',
      content: `You are the PigPulse Advisor, an expert AI veterinary assistant integrated into the PigPulse IoT swine health monitoring system. Your expertise covers:

1. SWINE VETERINARY MEDICINE: Respiratory diseases (PRRS, swine influenza, mycoplasma), febrile states, biosecurity protocols, isolation procedures.
2. THERMAL TELEMETRY: MLX90640 thermal array interpretation. Normal pig body temp: 38.3-39.4°C. Fever threshold: ≥39.8°C.
3. ACOUSTIC DIAGNOSTICS: INMP441 microphone cough detection. Cough rate >10/hour = clinical concern.
4. IOT HARDWARE: ESP32-S3 nodes, WiFi connectivity, ESP-NOW mesh, battery management.

RESPONSE RULES:
- Be concise but thorough. Use bullet points for clarity.
- When the user asks about their specific farm data, reference the LIVE DATA below.
- If data shows anomalies (high temps, frequent coughs, danger status), proactively flag them.
- Always recommend professional veterinary consultation for serious health concerns.
- Do NOT use markdown headers (##). Use emoji + bold text instead.
- Keep responses under 200 words unless the user asks for detail.${dataSection}`
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
        max_tokens: 600,
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
