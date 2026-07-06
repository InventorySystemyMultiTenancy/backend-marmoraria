import { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import { prisma } from '../../config/database';
import { renderQuoteHtml } from '../../utils/pdfTemplate';
import { AppError } from '../../middlewares/errorHandler';

export async function generateQuotePdf(req: Request, res: Response) {
  const quote = await prisma.quote.findUnique({
    where: { id: req.params.quoteId },
    include: { items: { include: { marble: true } }, client: true },
  });
  if (!quote) throw new AppError('Orçamento não encontrado', 404);

  const company = await prisma.company.findFirst();
  const html = renderQuoteHtml(quote, company);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });

    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="orcamento-${quote.quoteNumber}.pdf"`);
    res.send(pdfBuffer);
  } finally {
    await browser.close();
  }
}
