import { DIGITS_4_8_REGEX } from '../constants';

/**
 * 按“关键词优先、兜底数字匹配”的策略提取验证码。
 * 目标：尽量减少把年份、日期、长编号误识别为验证码。
 */
export function extractCode(subject: string, text: string): string | null {
  const source = `${subject || ''}\n${text || ''}`;
  const candidates: Array<{ code: string; score: number; pos: number }> = [];
  const keywordPatterns = [
    /(?:verification\s*code|verify\s*code|one[-\s]*time\s*code|otp|code\s*is|code|验证码|校验码|动态码|一次性(?:密码|验证码)?)[^\d]{0,24}(\d{4,8})/gi,
    /(\d{4,8})[^\d]{0,24}(?:verification\s*code|verify\s*code|one[-\s]*time\s*code|otp|验证码|校验码|动态码)/gi
  ];

  for (const re of keywordPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const code = m[1];
      if (isLikelyCode(code, source, m.index)) {
        candidates.push({ code, score: 100 - Math.min(30, Math.floor(m.index / 100)), pos: m.index });
      }
    }
  }

  let m: RegExpExecArray | null;
  while ((m = DIGITS_4_8_REGEX.exec(source)) !== null) {
    const code = m[0];
    if (isLikelyCode(code, source, m.index)) {
      candidates.push({ code, score: 50 - Math.min(20, Math.floor(m.index / 120)), pos: m.index });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.pos - b.pos));
  return candidates[0].code;
}

function isLikelyCode(code: string, source: string, pos: number): boolean {
  if (!/^\d{4,8}$/.test(code)) return false;
  if (/^(19|20)\d{2}$/.test(code)) return false;
  const near = source.slice(Math.max(0, pos - 12), Math.min(source.length, pos + code.length + 12));
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(near)) return false;
  if (/\d{9,}/.test(near.replace(code, ''))) return false;
  return true;
}

