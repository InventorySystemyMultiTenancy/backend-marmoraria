import { Quote, QuoteItem, Marble, Client, Company } from '@prisma/client';

type QuoteWithRelations = Quote & {
  items: (QuoteItem & { marble: Marble })[];
  client: Client | null;
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: Date | null | undefined) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR');
}

export function renderQuoteHtml(quote: QuoteWithRelations, company: Company | null) {
  const clientName = quote.client?.name ?? quote.clientName ?? 'Cliente';
  const clientPhone = quote.client?.phone ?? quote.clientPhone ?? '-';
  const clientEmail = quote.client?.email ?? quote.clientEmail ?? '-';

  const rows = quote.items
    .map(
      (item) => `
      <tr>
        <td>${item.description ?? '-'}</td>
        <td>${item.marble.name}</td>
        <td>${item.widthCm} x ${item.heightCm} cm (${item.thicknessMm}mm)</td>
        <td>${item.areaM2.toFixed(2)} m²</td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.totalPrice)}</td>
      </tr>`
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Helvetica', Arial, sans-serif; color: #1A1614; margin: 0; padding: 40px; font-size: 13px; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C9A96E; padding-bottom: 16px; margin-bottom: 24px; }
      .header img { height: 56px; }
      .company-name { font-size: 22px; font-weight: bold; color: #1A1614; }
      .company-info { font-size: 11px; color: #6B6560; }
      .quote-meta { display: flex; justify-content: space-between; margin-bottom: 20px; background: #F5F0E8; padding: 12px 16px; border-radius: 8px; }
      .section-title { font-weight: bold; font-size: 13px; text-transform: uppercase; color: #C9A96E; margin: 20px 0 8px; letter-spacing: 0.5px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 12px; }
      th { background: #1A1614; color: #fff; }
      .totals { margin-top: 16px; width: 280px; margin-left: auto; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
      .totals .total { font-weight: bold; font-size: 16px; border-top: 2px solid #1A1614; padding-top: 8px; margin-top: 4px; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #6B6560; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="company-name">${company?.name ?? 'Marmoraria Pedras Pedroza'}</div>
        <div class="company-info">
          ${company?.cnpj ? `CNPJ: ${company.cnpj}<br/>` : ''}
          ${company?.phone ? `Tel: ${company.phone}<br/>` : ''}
          ${company?.email ?? ''}
        </div>
      </div>
      ${company?.logoUrl ? `<img src="${company.logoUrl}" />` : ''}
    </div>

    <div class="quote-meta">
      <div><strong>Orçamento Nº</strong> ${quote.quoteNumber}</div>
      <div><strong>Data:</strong> ${formatDate(quote.createdAt)}</div>
      <div><strong>Válido até:</strong> ${formatDate(quote.validUntil)}</div>
    </div>

    <div class="section-title">Cliente</div>
    <div>Nome: ${clientName}</div>
    <div>Telefone: ${clientPhone}</div>
    <div>Email: ${clientEmail}</div>

    <div class="section-title">Itens do Orçamento</div>
    <table>
      <thead>
        <tr><th>Descrição</th><th>Mármore</th><th>Dimensões</th><th>Área</th><th>Qtd.</th><th>Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal:</span><span>${formatCurrency(quote.subtotal)}</span></div>
      <div><span>Desconto:</span><span>${formatCurrency(quote.discount + (quote.subtotal * quote.discountPct) / 100)}</span></div>
      <div class="total"><span>TOTAL:</span><span>${formatCurrency(quote.total)}</span></div>
    </div>

    ${quote.notes ? `<div class="section-title">Observações</div><div>${quote.notes}</div>` : ''}

    <div class="footer">
      Para confirmar seu pedido, entre em contato:<br/>
      WhatsApp: ${company?.whatsapp ?? '-'}<br/>
      Email: ${company?.email ?? '-'}
    </div>
  </body>
  </html>`;
}
