import { Request, Response } from 'express';
import OpenAI from 'openai';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/errorHandler';
import { logger } from '../../utils/logger';

const OPENAI_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-5.6-luna';

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectType: {
      type: 'string',
      description: 'Tipo de ambiente/peça identificado na foto (ex: bancada de cozinha, piso, banheiro).',
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          marbleId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['marbleId', 'reason'],
      },
    },
    estimatedWidthCm: { type: ['number', 'null'] },
    estimatedHeightCm: { type: ['number', 'null'] },
    notes: { type: 'string' },
  },
  required: ['projectType', 'recommendations', 'estimatedWidthCm', 'estimatedHeightCm', 'notes'],
};

interface AiRecommendationPayload {
  projectType: string;
  recommendations: { marbleId: string; reason: string }[];
  estimatedWidthCm: number | null;
  estimatedHeightCm: number | null;
  notes: string;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function recommendMarble(req: Request, res: Response) {
  if (!req.file) throw new AppError('Envie uma foto do ambiente ou peça', 400);
  if (!process.env.OPENAI_API_KEY) throw new AppError('Recomendação por IA indisponível no momento', 503);

  const marbles = await prisma.marble.findMany({
    where: { isPublic: true, isAvailable: true },
    select: { id: true, name: true, type: true, color: true, origin: true, description: true },
    take: 60,
  });

  if (marbles.length === 0) throw new AppError('Nenhum mármore disponível para recomendação no momento', 503);

  const catalogText = marbles
    .map(
      (m) =>
        `- id: ${m.id} | nome: ${m.name} | tipo: ${m.type} | cor: ${m.color ?? '-'} | origem: ${m.origin ?? '-'} | descrição: ${m.description ?? '-'}`
    )
    .join('\n');

  const prompt = `Você é um especialista em mármores e granitos ajudando um cliente de marmoraria a escolher a melhor peça para o projeto mostrado na foto enviada.

Catálogo disponível (recomende SOMENTE ids desta lista, nunca invente um id):
${catalogText}

Analise a foto e responda em português:
1. Identifique o tipo de projeto (ex: bancada de cozinha, piso, banheiro, escada, fachada).
2. Recomende de 1 a 3 mármores do catálogo acima que combinem com o estilo, a cor e o uso do ambiente, explicando brevemente o motivo de cada escolha.
3. Estime as dimensões aproximadas (largura e altura em cm) da peça necessária, usando referências visuais da foto (móveis, portas, azulejos etc). Se não for possível estimar com segurança, retorne null nesses dois campos.
4. Em "notes", inclua sempre um aviso de que a estimativa de medida é apenas visual e que é necessário medir o local antes de confirmar o pedido.`;

  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

  let parsed: AiRecommendationPayload;
  try {
    const response = await getClient().responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: dataUrl, detail: 'auto' },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'MarbleRecommendation',
          schema: RECOMMENDATION_SCHEMA,
          strict: true,
        },
      },
    });

    parsed = JSON.parse(response.output_text) as AiRecommendationPayload;
  } catch (err) {
    logger.error({ err }, 'Falha ao chamar a API de recomendação por IA');
    throw new AppError('Não foi possível analisar a imagem agora. Tente novamente em instantes.', 502);
  }

  const validIds = new Set(marbles.map((m) => m.id));
  const wantedIds = parsed.recommendations.map((r) => r.marbleId).filter((id) => validIds.has(id));
  const recommendedMarbles = wantedIds.length
    ? await prisma.marble.findMany({ where: { id: { in: wantedIds } } })
    : [];

  const recommendations = parsed.recommendations
    .map((r) => {
      const marble = recommendedMarbles.find((m) => m.id === r.marbleId);
      return marble ? { marble, reason: r.reason } : null;
    })
    .filter((r): r is { marble: (typeof recommendedMarbles)[number]; reason: string } => r !== null);

  res.json({
    projectType: parsed.projectType,
    recommendations,
    estimatedWidthCm: parsed.estimatedWidthCm,
    estimatedHeightCm: parsed.estimatedHeightCm,
    notes: parsed.notes,
  });
}
