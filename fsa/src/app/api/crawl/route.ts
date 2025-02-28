import { NextResponse } from 'next/server';
import { Crawler } from '../../../services/Crawler';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    const crawler = new Crawler();
    const paths = await crawler.crawl(url);
    
    // Print each workflow's paths
    Object.entries(paths).forEach(([workflowId, workflowPaths]: [string, string[]]) => {
      console.log(`\nWorkflow ${workflowId}:`);
      console.log('  ' + workflowPaths.join(' → '));
    });

    // Print FSA structure
    crawler.printFSA();

    // Generate and log interaction sequences
    const sequences = crawler.generateInteractionSequences();
    sequences.forEach(seq => console.log(seq));

    return NextResponse.json({
      workflows: paths,
      sequences: sequences
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' }, 
      { status: 500 }
    );
  }
}