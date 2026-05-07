import { handleApi } from './routes/api';
import { handleWeb } from './routes/web';
import { logEvent } from './services/events';
import type { Env } from './types';
import { jsonError, withCors } from './utils/http';

export default {
  /**
   * Worker HTTP 入口：统一方法校验、路由分发、异常兜底。
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), request, env);
    if (!['GET', 'POST'].includes(method)) return jsonError('method_not_allowed', 405, request, env);

    try {
      const webResponse = await handleWeb(request, env);
      if (webResponse) return webResponse;
      return await handleApi(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal_error';
      await logEvent(env, 'api_error', null, null, { message });
      return jsonError(message, 500, request, env);
    }
  }
};
