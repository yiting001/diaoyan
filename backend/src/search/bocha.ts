export interface SearchResultItem {
  name: string;
  url: string;
  snippet: string;
  siteName?: string;
  datePublished?: string;
}

// 最新优先：按发布时间降序排序（无时间的排后面，保持原相对顺序）
export function sortByFreshness(items: SearchResultItem[]): SearchResultItem[] {
  return items
    .map((item, idx) => ({ item, idx, ts: Date.parse(item.datePublished || '') || 0 }))
    .sort((a, b) => (b.ts !== a.ts ? b.ts - a.ts : a.idx - b.idx))
    .map((x) => x.item);
}

// 博查AI Web Search API: https://api.bochaai.com/v1/web-search
export async function bochaWebSearch(
  apiKey: string,
  query: string,
  count = 8,
  freshness = 'oneYear',
): Promise<SearchResultItem[]> {
  const res = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      summary: true,
      freshness: freshness || 'oneYear',
      count,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || (json.code && json.code !== 200)) {
    throw new Error(
      `博查AI搜索失败: HTTP ${res.status} ${json.msg ?? json.message ?? ''}`.trim(),
    );
  }
  const values = json?.data?.webPages?.value ?? [];
  const items = values.map((v: any) => ({
    name: v.name ?? '',
    url: v.url ?? '',
    snippet: v.summary ?? v.snippet ?? '',
    siteName: v.siteName ?? '',
    datePublished: v.datePublished ?? v.dateLastCrawled ?? '',
  }));
  return sortByFreshness(items);
}

const DOUBAO_FRESHNESS: Record<string, string> = {
  oneDay: 'OneDay',
  oneWeek: 'OneWeek',
  oneMonth: 'OneMonth',
  oneYear: 'OneYear',
};

// 豆包（火山引擎）联网搜索 API: https://open.feedcoopapi.com/search_api/global_search
export async function doubaoWebSearch(
  apiKey: string,
  query: string,
  count = 8,
  freshness = 'oneYear',
): Promise<SearchResultItem[]> {
  const body: Record<string, unknown> = {
    Query: query.slice(0, 100),
    DocCount: count,
    MaxSnippetLength: 300,
    MaxImageCountPerDoc: 0,
  };
  const timeRange = DOUBAO_FRESHNESS[freshness];
  if (timeRange) body.TimeRange = timeRange;
  const res = await fetch('https://open.feedcoopapi.com/search_api/global_search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `豆包搜索失败: HTTP ${res.status} ${json?.ResponseMetadata?.Error?.Message ?? json?.message ?? json?.msg ?? ''}`.trim(),
    );
  }
  const result = json?.Result ?? json?.result ?? json;
  const docs: any[] =
    result?.DocResults ?? result?.WebResults ?? result?.DocList ?? result?.Docs ?? result?.doc_results ?? [];
  if (!Array.isArray(docs) || docs.length === 0) {
    const errMsg = result?.ErrorMessage ?? json?.ResponseMetadata?.Error?.Message;
    if (errMsg) throw new Error(`豆包搜索失败: ${errMsg}`);
    return [];
  }
  const toDate = (v: unknown): string => {
    if (!v) return '';
    if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString();
    return String(v);
  };
  const items = docs.map((d: any) => ({
    name: d.Title ?? d.title ?? '',
    url: d.Url ?? d.url ?? '',
    snippet: d.Summary ?? d.Snippet ?? d.Abstract ?? d.summary ?? d.snippet ?? '',
    siteName: d.SiteName ?? d.Source ?? d.site_name ?? '',
    datePublished: toDate(d.PublishTime ?? d.PublishDate ?? d.publish_time ?? d.date),
  }));
  return sortByFreshness(items);
}

// 按配置选择搜索源
export async function webSearch(
  setting: {
    provider: string;
    apiKey: string;
    doubaoApiKey: string;
    freshness: string;
    resultCount: number;
  },
  query: string,
): Promise<{ items: SearchResultItem[]; providerName: string }> {
  const count = setting.resultCount || 8;
  if (setting.provider === 'doubao') {
    return {
      items: await doubaoWebSearch(setting.doubaoApiKey, query, count, setting.freshness),
      providerName: '豆包搜索',
    };
  }
  return {
    items: await bochaWebSearch(setting.apiKey, query, count, setting.freshness),
    providerName: '博查AI',
  };
}

export function formatSearchResults(items: SearchResultItem[]): string {
  return items
    .map(
      (r, i) =>
        `[${i + 1}] ${r.name}（${r.siteName || r.url}${r.datePublished ? ` · ${r.datePublished.slice(0, 10)}` : ''}）\n${r.snippet}`,
    )
    .join('\n\n');
}
