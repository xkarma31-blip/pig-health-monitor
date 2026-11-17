/**
 * Expo Router server route: /api/chat
 *
 * Parity port of api/chat.js (Vercel). Advisor proxy with the same provider
 * priority (Groq → Gemini → SiliconFlow → OpenRouter) and offline fallback.
 */
const CORS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers':
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
};

function env(name: string): string {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { messages, context } = await request.json();

    const GROQ_API_KEY = env('GROQ_API_KEY_PIGPULSE') || env('GROQ_API_KEY');
    const OPENROUTER_API_KEY = env('OPENROUTER_API_KEY');
    const GEMINI_API_KEY = env('GEMINI_API_KEY') || env('GEMINI_API_KEY_1');
    const SILICONFLOW_API_KEY = env('SILICONFLOW_API_KEY');

    if (!GROQ_API_KEY && !OPENROUTER_API_KEY && !GEMINI_API_KEY && !SILICONFLOW_API_KEY) {
      return json({
        reply: '⚠️ System Notice: I am operating in offline mode because no AI API key (GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY) has been configured in the server environment yet. I can still answer questions using my built-in veterinary knowledge base.',
      }, 200);
    }

    const hasLiveData = context && (context.sensors || context.recentAlerts || context.roster);
    let dataSection = '';
    if (hasLiveData) {
      dataSection += '\n\n=== LIVE FARM DATA ===';
      if (context.sensors?.length) {
        dataSection += '\n\nSENSOR READINGS:';
        context.sensors.forEach((s: any) => {
          dataSection += `\n- ${s.label}: ${s.value}${s.unit} [Status: ${s.status}] (last updated: ${s.lastUpdated})`;
        });
      }
      if (context.recentAlerts?.length) {
        dataSection += '\n\nACTIVE ALERTS:';
        context.recentAlerts.forEach((a: any) => {
          dataSection += `\n- [${a.severity}] ${a.type}: ${a.message} (device: ${a.deviceId})`;
        });
      }
      if (context.roster?.length) {
        dataSection += '\n\nPIG ROSTER:';
        context.roster.forEach((p: any) => {
          const tags = p.tags?.length ? ` [Tags: ${p.tags.join(', ')}]` : '';
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
 3. ACOUSTIC DIAGNOSTICS: on-device cough classification (PANNs Cnn14_16k + logistic head). Cough rate >10/hour = clinical concern.
 4. IOT HARDWARE: ESP32-S3 nodes, WiFi connectivity, battery management.

RESPONSE RULES:
- Be concise but thorough. Use bullet points for clarity.
- When the user asks about their specific farm data, reference the LIVE DATA below.
- If data shows anomalies (high temps, frequent coughs, danger status), proactively flag them.
- Always recommend professional veterinary consultation for serious health concerns.
- Do NOT use markdown headers (##). Use emoji + bold text instead.
- Keep responses under 200 words unless the user asks for detail.${dataSection}`,
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
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [systemPrompt, ...(messages || [])],
        max_tokens: 600,
        temperature: 0.3,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch from AI Provider');
    return json({ reply: data.choices[0].message.content }, 200);
  } catch (error) {
    return json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
}
