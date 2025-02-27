import type { NextApiRequest, NextApiResponse } from 'next';
import { Crawler } from '../../services/Crawler';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    const crawler = new Crawler();
    const paths = await crawler.crawl(url);
    res.status(200).json({ paths });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}