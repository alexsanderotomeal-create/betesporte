import { ApiConnectionConfig } from '../types/betting';

const STORAGE_KEY = 'betesporte_api_config';

export const DEFAULT_API_CONFIG: ApiConnectionConfig = {
  mode: 'simulated_live',
  apiUrl: 'https://api.thesportsdb.com/v1/json/3/all_sports.php',
  apiKey: 'bet_live_prod_key_7792',
  pollingIntervalSeconds: 3,
  isConnected: true,
  lastSyncTime: 'Agora',
  oddsAdjustmentFactor: 1.0,
};

export const loadApiConfig = (): ApiConnectionConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_API_CONFIG;
};

export const saveApiConfig = (config: ApiConnectionConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
};

export interface ApiTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  sampleData?: unknown;
}

export const testExternalApiConnection = async (url: string, apiKey: string): Promise<ApiTestResult> => {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(apiKey ? { 'X-Auth-Token': apiKey, 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });

    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      const data = await res.json().catch(() => ({ status: 'ok' }));
      return {
        success: true,
        latencyMs: latency,
        message: `Conexao bem-sucedida! Status HTTP ${res.status}`,
        sampleData: data,
      };
    }

    return {
      success: false,
      latencyMs: latency,
      message: `Servidor retornou erro HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err: unknown) {
    const latency = Math.round(performance.now() - startTime);
    // Reporta a falha de verdade.
    //
    // Antes, este catch devolvia success: true com um payload inventado de
    // "Opta/SportRadar Bridge". Um teste de conexao que nunca falha esconde
    // justamente o problema que ele deveria acusar: CORS bloqueado, chave
    // invalida ou endpoint fora do ar. No navegador, o erro real costuma ser
    // "Failed to fetch" porque o CORS nao expõe o status ao JS.
    const reason =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Timeout de 4s ao responder.'
        : err instanceof Error
          ? err.message
          : 'Falha na requisicao.';

    return {
      success: false,
      latencyMs: latency,
      message: `Falha ao conectar (${reason}) Se for CORS, o endpoint precisa enviar Access-Control-Allow-Origin.`,
    };
  } finally {
    clearTimeout(timeout);
  }
};
