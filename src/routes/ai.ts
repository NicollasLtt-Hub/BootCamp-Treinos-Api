import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { UIMessage } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { Readable } from "node:stream";
import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { GetUserTrainData } from "../usecases/GetUserTrainData.js";
import { ListWorkoutPlans } from "../usecases/ListWorkoutPlans.js";
import { UpsertUserTrainData } from "../usecases/UpsertUserTrainData.js";

const SYSTEM_PROMPT = `Você é um personal trainer virtual especialista em montagem de planos de treino de musculação.

## Tom e linguagem
- Seja amigável, motivador e use linguagem simples, sem jargões técnicos.
- Seu público principal são pessoas leigas em musculação.
- Respostas curtas e objetivas. Nada de textão.

## Fluxo obrigatório
1. **SEMPRE** chame a tool "getUserTrainData" ANTES de qualquer interação com o usuário. Isso é obrigatório.
2. Se o retorno for **null** (usuário sem dados cadastrados):
   - Pergunte ao usuário: nome, peso (em kg), altura (em cm), idade e percentual de gordura corporal.
   - Faça as perguntas de forma simples e direta, tudo em uma única mensagem.
   - Após receber as respostas, salve com a tool "updateUserTrainData". Converta o peso de kg para gramas (ex: 80kg = 80000g).
3. Se o retorno tiver dados preenchidos:
   - Cumprimente o usuário pelo nome e pergunte como pode ajudar.

## Criar plano de treino
Quando o usuário quiser criar um plano de treino:
1. Pergunte: objetivo, quantos dias por semana pode treinar e se tem alguma restrição física ou lesão. Poucas perguntas, simples e diretas.
2. Use a tool "getWorkoutPlans" para verificar planos existentes antes de criar um novo.
3. Monte o plano e chame a tool "createWorkoutPlan".

### Regras do plano
- O plano DEVE ter **exatamente 7 dias** (MONDAY a SUNDAY).
- Dias sem treino devem ter: isRest: true, exercises: [], estimatedDurationInSeconds: 0.
- Nomes descritivos para cada dia (ex: "Superior A - Peito e Tríceps", "Descanso").

### Divisões (Splits) por dias disponíveis
- **2-3 dias/semana**: Full Body ou ABC (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas+Ombros)
- **4 dias/semana**: Upper/Lower (cada grupo 2x/semana) ou ABCD (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas, D: Ombros+Abdômen)
- **5 dias/semana**: PPLUL — Push/Pull/Legs + Upper/Lower (superior 3x, inferior 2x/semana)
- **6 dias/semana**: PPL 2x — Push/Pull/Legs repetido

### Princípios de montagem
- Músculos sinérgicos juntos (peito+tríceps, costas+bíceps).
- Exercícios compostos primeiro, isoladores depois.
- 4 a 8 exercícios por sessão.
- 3-4 séries por exercício. 8-12 reps (hipertrofia), 4-6 reps (força).
- Descanso entre séries: 60-90s (hipertrofia), 2-3min (compostos pesados).
- Evitar treinar o mesmo grupo muscular em dias consecutivos.

### Imagens de capa (coverImageUrl)
SEMPRE forneça um coverImageUrl para cada dia de treino. Escolha com base no foco muscular:

**Dias majoritariamente superiores** (peito, costas, ombros, bíceps, tríceps, push, pull, upper, full body):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL

**Dias majoritariamente inferiores** (pernas, glúteos, quadríceps, posterior, panturrilha, legs, lower):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY

Alterne entre as duas opções de cada categoria para variar. Dias de descanso usam imagem de superior.`;

export const aiRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      tags: ["AI"],
      summary: "Chat with AI personal trainer",
      response: {
        401: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const { message } = request.body as { message: UIMessage[] };

      const result = streamText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        tools: {
          getUserTrainData: tool({
            description:
              "Busca os dados de treino do usuário autenticado (peso, altura, idade, gordura corporal). Retorna null se não existirem.",
            inputSchema: z.object({}),
            execute: async () => {
              const getUserTrainData = new GetUserTrainData();
              return await getUserTrainData.execute({
                userId: session.user.id,
              });
            },
          }),

          updateUserTrainData: tool({
            description:
              "Cria ou atualiza os dados de treino do usuário (peso em gramas, altura em cm, idade, % gordura corporal)",
            inputSchema: z.object({
              weightInGrams: z
                .number()
                .int()
                .positive()
                .describe("Peso do usuário em gramas (ex: 80kg = 80000)"),
              heightInCentimeters: z
                .number()
                .int()
                .positive()
                .describe("Altura do usuário em centímetros"),
              age: z
                .number()
                .int()
                .positive()
                .describe("Idade do usuário em anos"),
              bodyFatPercentage: z
                .number()
                .int()
                .min(1)
                .max(100)
                .describe("Percentual de gordura corporal (1-100)"),
            }),
            execute: async (input) => {
              const upsertUserTrainData = new UpsertUserTrainData();
              return await upsertUserTrainData.execute({
                userId: session.user.id,
                ...input,
              });
            },
          }),

          getWorkoutPlans: tool({
            description:
              "Lista todos os planos de treino do usuário autenticado, incluindo dias e exercícios",
            inputSchema: z.object({}),
            execute: async () => {
              const listWorkoutPlans = new ListWorkoutPlans();
              return await listWorkoutPlans.execute({
                userId: session.user.id,
              });
            },
          }),

          createWorkoutPlan: tool({
            description:
              "Cria um novo plano de treino completo para o usuário. O plano DEVE ter exatamente 7 dias (MONDAY a SUNDAY).",
            inputSchema: z.object({
              name: z.string().describe("Nome do plano de treino"),
              workoutDays: z.array(
                z.object({
                  name: z
                    .string()
                    .describe(
                      "Nome do dia (ex: Peito e Tríceps, Descanso)"
                    ),
                  weekDay: z.enum(WeekDay).describe("Dia da semana"),
                  isRest: z
                    .boolean()
                    .describe(
                      "Se é dia de descanso (true) ou treino (false)"
                    ),
                  estimatedDurationInSeconds: z
                    .number()
                    .describe(
                      "Duração estimada em segundos (0 para dias de descanso)"
                    ),
                  coverImageUrl: z
                    .string()
                    .url()
                    .describe(
                      "URL da imagem de capa do dia de treino. Usar as URLs de superior ou inferior conforme o foco muscular do dia."
                    ),
                  exercises: z
                    .array(
                      z.object({
                        order: z.number().describe("Ordem do exercício"),
                        name: z.string().describe("Nome do exercício"),
                        sets: z.number().describe("Número de séries"),
                        reps: z.number().describe("Número de repetições"),
                        restTimeInSeconds: z
                          .number()
                          .describe(
                            "Tempo de descanso entre séries em segundos"
                          ),
                      })
                    )
                    .describe(
                      "Lista de exercícios (vazia para dias de descanso)"
                    ),
                })
              ),
            }),
            execute: async (input) => {
              const createWorkoutPlan = new CreateWorkoutPlan();
              return await createWorkoutPlan.execute({
                userId: session.user.id,
                name: input.name,
                workoutDays: input.workoutDays,
              });
            },
          }),
        },
        stopWhen: stepCountIs(5),
        messages: await convertToModelMessages(message),
      });

      const response = result.toUIMessageStreamResponse();

      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      if (!response.body) {
        return reply.status(500).send({ error: "Empty AI response stream" });
      }

      const nodeStream = Readable.fromWeb(
        response.body as unknown as import("node:stream/web").ReadableStream
      );
      reply.status(200 as never);
      return reply.send(nodeStream as never);
    },
  });
};