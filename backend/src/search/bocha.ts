export interface SearchResultItem {
  name: string;
  url: string;
  snippet: string;
  siteName?: string;
  datePublished?: string;
}

// 博查AI Web Search API: https://api.bochaai.com/v1/web-search
export async function bochaWebSearch(
  apiKey: string,
  query: string,
  count = 8,
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
      freshness: 'noLimit',
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
  return values.map((v: any) => ({
    name: v.name ?? '',
    url: v.url ?? '',
    snippet: v.summary ?? v.snippet ?? '',
    siteName: v.siteName ?? '',
    datePublished: v.datePublished ?? v.dateLastCrawled ?? '',
  }));
}

export function formatSearchResults(items: SearchResultItem[]): string {
  return items
    .map(
      (r, i) =>
        `[${i + 1}] ${r.name}（${r.siteName || r.url}${r.datePublished ? ` · ${r.datePublished.slice(0, 10)}` : ''}）\n${r.snippet}`,
    )
    .join('\n\n');
}
