import { NextResponse } from 'next/server';
import { Crawler } from '../../../services/Crawler';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    const crawler = new Crawler();
    const paths = await crawler.crawl(url);
    console.log(paths);
    return NextResponse.json(paths);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' }, 
      { status: 500 }
    );
  }
}