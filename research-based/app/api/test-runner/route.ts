import { WebExplorer } from '@/lib/testing/WebExplorer';

export async function POST(request: Request) {
  const { baseUrl } = await request.json();
  
  const explorer = new WebExplorer();
  await explorer.initialize();

  try {
    const results = await explorer.exploreWebsite(baseUrl);
    return Response.json({ results });
  } catch (error) {
    console.error('Exploration failed:', error);
    return Response.json({ error: 'Exploration failed' }, { status: 500 });
  }
}