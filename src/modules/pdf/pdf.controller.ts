import { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { prisma } from '../../config/database';
import { renderQuoteHtml } from '../../utils/pdfTemplate';
import { AppError } from '../../middlewares/errorHandler';

// Em produção (Render), usamos o Chromium empacotado do @sparticuz/chromium via
// puppeteer-core: baixar o Chrome completo no build provou ser instável (o cache
// nem sempre sobrevive entre build e runtime). Em dev local, usamos o puppeteer
// normal, já que o binário do @sparticuz/chromium só roda em Linux.
async function launchBrowser() {
  if (process.env.NODE_ENV === 'production') {
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function generateQuotePdf(req: Request, res: Response) {
  const quote = await prisma.quote.findUnique({
    where: { id: req.params.quoteId },
    include: { items: { include: { marble: true } }, client: true },
  });
  if (!quote) throw new AppError('Orçamento não encontrado', 404);

  const company = await prisma.company.findFirst();
  const html = renderQuoteHtml(quote, company);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBytes = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });

    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="orcamento-${quote.quoteNumber}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } finally {
    await browser.close();
  }
}
